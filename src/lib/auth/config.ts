import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { db } from "@/lib/db";
import { accounts, sessions, users, verificationTokens } from "@/lib/db/schema";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.toLowerCase();

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  pages: { signIn: "/studio/login", verifyRequest: "/studio/login/check-email" },
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      // Resend only accepts a `from` address on a domain verified in that Resend
      // account, except its built-in onboarding@resend.dev sandbox sender, which
      // delivers only to the account owner's own email — exactly ADMIN_EMAIL here.
      // Switch this to a mosamianphotography.com address once that domain is
      // verified in Resend (see brief section 3 / docs/deploy.md).
      from: "Mosa Mian Photography <onboarding@resend.dev>",
    }),
  ],
  callbacks: {
    // Single admin account: reject the magic-link email step entirely for any other
    // address, rather than creating a user row and locking it out downstream.
    async signIn({ user }) {
      if (!ADMIN_EMAIL) return false;
      return user.email?.toLowerCase() === ADMIN_EMAIL;
    },
    async jwt({ token, trigger, session, user }) {
      if (user?.id) {
        const dbUser = await db.query.users.findFirst({ where: eq(users.id, user.id) });
        token.mfaEnrolled = Boolean(dbUser?.mfaSecret);
        token.mfaVerified = false;
      }
      if (trigger === "update" && session) {
        if (typeof session.mfaEnrolled === "boolean") token.mfaEnrolled = session.mfaEnrolled;
        if (typeof session.mfaVerified === "boolean") token.mfaVerified = session.mfaVerified;
      }
      return token;
    },
    async session({ session, token }) {
      session.mfaEnrolled = Boolean(token.mfaEnrolled);
      session.mfaVerified = Boolean(token.mfaVerified);
      return session;
    },
  },
});
