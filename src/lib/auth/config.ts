import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";
import { verifyPassword } from "@/lib/password";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.toLowerCase();

// "Remember me" duration vs. a plain session that doesn't survive a day -- see the
// jwt callback below for how this actually gets applied to the token's expiry.
const REMEMBER_ME_SECONDS = 60 * 60 * 24 * 30; // 30 days
const DEFAULT_SESSION_SECONDS = 60 * 60 * 12; // 12 hours

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
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .toLowerCase()
          .trim();
        const password = String(credentials?.password ?? "");
        // Single admin account: reject anything else before even touching the DB,
        // same as the old magic-link flow did.
        if (!ADMIN_EMAIL || !password || email !== ADMIN_EMAIL) return null;

        const dbUser = await db.query.users.findFirst({ where: eq(users.email, email) });
        if (!dbUser?.passwordHash) return null;
        if (!verifyPassword(password, dbUser.passwordHash)) return null;

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
      }
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
