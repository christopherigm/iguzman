import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Media 2 Go",
    short_name: "Media 2 Go",
    description:
      "Download, store, and watch videos from any platform - offline-ready, anytime, anywhere.",

    id: "/",
    start_url: "/",
    display: "standalone",
    background_color: "#69bbf2",
    theme_color: "#68c3f7",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icons/icon-192x192.jpg",
        sizes: "192x192",
        type: "image/jpeg",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.jpg",
        sizes: "512x512",
        type: "image/jpeg",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-192x192.jpg",
        sizes: "192x192",
        type: "image/jpeg",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512x512.jpg",
        sizes: "512x512",
        type: "image/jpeg",
        purpose: "maskable",
      },
    ],
  };
}
