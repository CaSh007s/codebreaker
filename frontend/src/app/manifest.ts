import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Codebreaker",
    short_name: "Codebreaker",
    description: "Decode the cipher in a tactical logic game.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#0a0a0b",
    theme_color: "#0a0a0b",
    categories: ["games", "entertainment"],
    icons: [
      {
        src: "/app-icon.png",
        sizes: "192x192 512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
