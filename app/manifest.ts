import type { MetadataRoute } from "next";

/**
 * Manifest for the installable mobile app. iOS reads `display` and the icons
 * when an employee taps Share -> Add to Home Screen, which is how the app gets
 * its own icon and a full-screen shell with no Safari chrome.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Reliance Predictive Safety Technologies",
    // Home-screen label. iOS truncates past ~12 characters, so keep it short.
    short_name: "RPST",
    description: "Chat with the team, submit ideas, and update leads from your phone.",
    start_url: "/m",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#070707",
    theme_color: "#070707",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
      { src: "/apple-icon", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/apple-icon", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
