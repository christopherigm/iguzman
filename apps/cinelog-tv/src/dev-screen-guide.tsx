import { useEffect } from "react";
import "./dev-screen-guide.css";

// Dev-only visual guide. Outlines the 1920x1080 TV screen bounds and the inner
// overscan-safe area so the layout can be checked in a desktop browser, where
// the `width=1920` viewport meta is ignored. Render it behind
// `import.meta.env.DEV` (see App.tsx) so it is excluded from the production
// .wgt shipped to the TV/emulator.
export function DevScreenGuide() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("dev-tv-frame");
    return () => root.classList.remove("dev-tv-frame");
  }, []);

  // Positioned absolutely against #root (made `position: relative` by the
  // frame styles), so labels track the frame edges at any window size.
  return (
    <div aria-hidden="true">
      <span className="dev-tv-frame__label dev-tv-frame__label--screen">
        TV screen · 1920×1080
      </span>
      <span className="dev-tv-frame__label dev-tv-frame__label--safe">
        Safe area
      </span>
    </div>
  );
}
