import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return ["", "/login", "/signup", "/privacy", "/terms"].map((p) => ({ url: `${base}${p}` }));
}
