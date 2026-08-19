import type { MetadataRoute } from "next";
import { getAllPublicPaths } from "@/lib/public-site/sitemap-entries";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.AUTH_URL ?? "https://mosamianphotography.com";
  const paths = await getAllPublicPaths();

  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    ...paths.map((p) => ({
      url: `${base}${p.path}`,
      lastModified: p.lastModified,
      changeFrequency: "weekly" as const,
    })),
  ];
}
