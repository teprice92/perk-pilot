import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PerkPilot — Travel rewards optimizer",
    short_name: "PerkPilot",
    description: "Travel smarter. Experience more. Optimize trips across your Amex Platinum and Chase Sapphire Reserve rewards.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#070d1a",
    theme_color: "#070d1a",
    categories: ["travel", "finance", "lifestyle"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "Saved trips", url: "/trips", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Benefits", url: "/benefits", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
