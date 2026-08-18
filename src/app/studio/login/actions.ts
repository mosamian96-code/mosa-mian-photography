"use server";

import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";

export async function requestMagicLink(formData: FormData) {
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();

  // Only ever send mail to the one allowed address, but always land on the same
  // "check your email" page regardless — so the response gives no signal about
  // whether the submitted address matched.
  if (email && adminEmail && email === adminEmail) {
    await signIn("resend", { email, redirectTo: "/studio" });
  }

  redirect("/studio/login/check-email");
}
