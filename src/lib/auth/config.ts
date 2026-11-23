import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/password";
import { PASSWORD_ATTEMPTS, failedAttempts, requestIp } from "@/lib/rate-limit";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.toLowerCase();

// "Remember me" duration vs. a plain session that doesn't survive a day -- see the
// jwt callback below for how this actually gets applied to the token's expiry.
const REMEMBER_ME_SECONDS = 60 * 60 * 24 * 30; // 30 days
const DEFAULT_SESSION_SECONDS = 60 * 60 * 12; // 12 hours

// The jwt callback runs on every studio request (the proxy checks the session), so the
// password-change time is cached per process for a minute rather than read each time.
// A reset therefore signs other devices out within a minute.
const PASSWORD_CHANGE_CACHE_MS = 60 * 1000;
const passwordChangeCache = new Map<string, { changedAt: number; fetchedAt: number }>();

async function signedInBeforePasswordChange(userId: string, signedInAt: unknown): Promise<boolean> {
  let entry = passwordChangeCache.get(userId);
  if (!entry || Date.now() - entry.fetchedAt > PASSWORD_CHANGE_CACHE_MS) {
    const row = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { passwordChangedAt: true } });
    entry = { changedAt: row?.passwordChangedAt?.getTime() ?? 0, fetchedAt: Date.now() };
    passwordChangeCache.set(userId, entry);
  }
  if (!entry.changedAt) return false;
  // Sessions from before this check existed have no signedInAt; they predate any
  // reset recorded here, so they end on the first reset.
  return typeof signedInAt !== "number" || signedInAt < entry.changedAt;
}

/** Called after a password change in this process, so its own sessions see it at once. */
export function forgetPasswordChangeCache(userId: string) {
  passwordChangeCache.delete(userId);
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt", maxAge: REMEMBER_ME_SECONDS },
  pages: { signIn: "/studio/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        remember: { label: "Remember me", type: "text" },
      },
      async authorize(credentials, request) {
        const email = String(credentials?.email ?? "")
          .toLowerCase()
          .trim();
        const password = String(credentials?.password ?? "");
        if (!password || password.length > 200) return null;

        // Wrong guesses are limited per visitor IP (any email) so a script can't keep
        // guessing; a correct sign-in clears the count. A blocked attempt fails the
        // same way a wrong password does -- Auth.js has no way to say "wait".
        const attemptKey = request ? requestIp(request) : "unknown";
        if (await failedAttempts.blockedFor("studio-login", attemptKey, PASSWORD_ATTEMPTS)) return null;

        // Single admin account: reject anything else before even touching the DB,
        // same as the old magic-link flow did.
        const dbUser =
          ADMIN_EMAIL && email === ADMIN_EMAIL ? await db.query.users.findFirst({ where: eq(users.email, email) }) : undefined;
        if (!dbUser?.passwordHash || !(await verifyPassword(password, dbUser.passwordHash))) {
          await failedAttempts.record("studio-login", attemptKey, PASSWORD_ATTEMPTS);
          return null;
        }
        await failedAttempts.clear("studio-login", attemptKey);

        return {
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
          remember: credentials?.remember === "true",
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Only present on the initial sign-in call, not on subsequent token refreshes
      // -- expiry is fixed at login time and doesn't get extended by later activity,
      // so "remember me" means "this login lasts 30 days," not a sliding window.
      if (user) {
        const remember = (user as { remember?: boolean }).remember ?? false;
        const seconds = remember ? REMEMBER_ME_SECONDS : DEFAULT_SESSION_SECONDS;
        token.exp = Math.floor(Date.now() / 1000) + seconds;
        token.signedInAt = Date.now();
        return token;
      }
      // A password reset signs out every session that started before it. Returning
      // null makes Auth.js treat the request as signed out.
      if (token.sub && (await signedInBeforePasswordChange(token.sub, token.signedInAt))) return null;
      return token;
    },
    async session({ session, token }) {
      // With the jwt session strategy, session.user isn't populated with an id by
      // default -- token.sub carries it (Auth.js sets it from user.id at sign-in).
      // Every route that authorizes by session.user.id depends on this.
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
