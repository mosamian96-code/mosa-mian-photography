import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    mfaEnrolled: boolean;
    mfaVerified: boolean;
    user: DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    mfaEnrolled?: boolean;
    mfaVerified?: boolean;
  }
}
