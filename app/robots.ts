import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL?.replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/login", "/signup", "/privacy", "/terms"],
      disallow: ["/api", "/dashboard", "/mail", "/contacts", "/accounts", "/senders", "/sync", "/sequences", "/auto-responders", "/settings"],
    },
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
