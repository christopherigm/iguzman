import React from "react";
import "./location-map.css";

export interface LocationMapProps {
  latitude: number;
  longitude: number;
  /** Accessible title for the embedded map iframe. */
  title: string;
  /** Zoom level (1 world … 20 building). @default 15 */
  zoom?: number;
  /** CSS height of the map. @default 320 (px) */
  height?: number | string;
  /** Corner radius in px. @default 12 */
  borderRadius?: number;
  className?: string;
}

/**
 * A Google Maps pointer for a coordinate, embedded with **no API key** via the
 * public `maps.google.com/maps?...&output=embed` endpoint. Decoupled and
 * reusable: it knows only a lat/lng and renders an iframe, so any app can drop it
 * on a contact page. For an interactive JS map with a custom marker you'd need a
 * keyed loader - deliberately out of scope here.
 */
export function LocationMap({
  latitude,
  longitude,
  title,
  zoom = 15,
  height = 320,
  borderRadius = 12,
  className,
}: LocationMapProps) {
  const src = `https://maps.google.com/maps?q=${latitude},${longitude}&z=${zoom}&output=embed`;
  return (
    <iframe
      className={`ui-location-map${className ? ` ${className}` : ""}`}
      title={title}
      src={src}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      style={{
        height: typeof height === "number" ? `${height}px` : height,
        borderRadius,
      }}
    />
  );
}

export default LocationMap;
