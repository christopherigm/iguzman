"use client";

import { useState } from "react";
import Image from "next/image";
import { Box } from "@repo/ui/core-elements/box";

export function ServerImageToggle({
  imageAlt,
  toggleLabel,
}: {
  imageAlt: string;
  toggleLabel: string;
}) {
  const [showAlternate, setShowAlternate] = useState(false);

  const toggle = () => setShowAlternate((prev) => !prev);
  const src = showAlternate ? "/server-2.jpg" : "/server.jpg";

  return (
    <Box padding="16px" alignItems="center" justifyContent="center">
      <Box
        width="100%"
        role="button"
        tabIndex={0}
        aria-label={toggleLabel}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        styles={{
          position: "relative",
          aspectRatio: showAlternate ? "3 / 4" : "4 / 3",
          maxWidth: 420,
          overflow: "hidden",
          cursor: "pointer",
        }}
      >
        <Image
          src={src}
          alt={imageAlt}
          fill
          sizes="(max-width: 900px) 100vw, 420px"
          style={{ objectFit: "cover" }}
        />
      </Box>
    </Box>
  );
}

export default ServerImageToggle;
