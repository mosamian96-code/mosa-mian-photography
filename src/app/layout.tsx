import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

// Self-hosted (downloaded at build time, served from our own origin — never a request
// to fonts.googleapis.com at runtime). Roles per docs/design-tokens.md: Fraunces for
// display/titles, Inter for everything else.
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  // `axes` (needed for the optical-size axis at large display sizes, per
  // docs/design-tokens.md) only works with the variable font, not discrete weights.
  weight: "variable",
  style: ["normal", "italic"],
  axes: ["opsz"],
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Mosa Mian Photography",
  description: "Portfolio and client galleries.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-neutral-900">{children}</body>
    </html>
  );
}
