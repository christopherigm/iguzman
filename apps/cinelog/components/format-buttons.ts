import type { MovieFormat } from "@/lib/catalog";

// Each selectable format renders as an IconButton. Blu-ray and 4K share the
// same disc icon, distinguished by icon color (blue vs. black); DVD, digital and
// other formats use their own icons. Shared by the catalog filter (single-select)
// and the movie edit / inbox cards (multi-select), so the format chips stay
// visually consistent across the app.
export const FORMAT_BUTTONS: {
  value: Exclude<MovieFormat, "">;
  icon: string;
  iconColor?: string;
  fullColor?: boolean;
}[] = [
  { value: "dvd", icon: "/icons/dvd.svg", iconColor: "#eb7d00" },
  { value: "bluray", icon: "/icons/blu-ray.svg", iconColor: "#2563eb" },
  { value: "4k", icon: "/icons/4k.svg", fullColor: true },
  { value: "digital", icon: "/icons/play-stream.svg", iconColor: "#0ea5e9" },
  { value: "other", icon: "/icons/disc.svg", iconColor: "#39a400" },
];
