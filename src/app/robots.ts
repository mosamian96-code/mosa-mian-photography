import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.AUTH_URL ?? "https://mosamianphotography.com";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /studio is the admin area and /g/ is private client-proofing links -- neither
        // belongs in search results even though both are already auth-gated.
        disallow: ["/studio", "/g/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
