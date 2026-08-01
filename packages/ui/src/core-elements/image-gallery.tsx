"use client";

import { useState, useEffect, useCallback } from "react";
import type { CSSProperties } from "react";
import Image from "next/image";
import { Swiper, SwiperSlide } from "swiper/react";
import { Thumbs, FreeMode, Zoom } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import { Box } from "./box";
import { Card } from "./card";
import { IconButton } from "./icon-button";
import { SliderControls } from "./slider-dots";
import { useScrollLock } from "./use-scroll-lock";
import getImageDimensionsFromUrl from "@repo/helpers/get-image-dimensions-from-url";
import "swiper/css";
import "swiper/css/free-mode";
import "swiper/css/thumbs";
import "swiper/css/zoom";
import "./image-gallery.css";

/**
 * **The photo gallery every detail page in the monorepo uses** - a mounted
 * slideshow with one large slide, a strip of thumbnails under it, and a
 * fullscreen viewer that pages and zooms. `apps/animals`' three catalog detail
 * routes and `apps/website`'s five (product, service, menu item, blog post,
 * highlight) all render it, so a record's photographs read as one object across
 * both sites. Don't hand-roll a second one: this replaced two copies that had
 * already drifted (only one of them zoomed, only one locked the page behind the
 * overlay, and their fullscreen viewers were different objects entirely).
 *
 * **Fullscreen is a second Swiper, not a lightbox showing one photo.** It opens
 * on the slide that was pressed and pages through the whole set with a swipe -
 * which is what a reader on a phone reaches for first - carrying no frame, no
 * card and no background of its own: the photograph alone over the scrim, with
 * `SliderControls` (the monorepo's one pagination row) beneath it. That row is
 * what the slide has to make space for, hence `--ui-gallery-fs-controls` in the
 * stylesheet.
 *
 * **Fullscreen also zooms**, through Swiper's own `Zoom` module: a pinch or a
 * double-tap on a touchscreen, and the magnifier in the control row for a mouse
 * - Swiper's zoom has no wheel handler, so without that button a desktop reader
 * would have only the double-click. `MAX_ZOOM` is deliberately not capped to
 * the photo's natural size (`limitToOriginalSize`): a small original would then
 * make the button dead rather than merely soft. **Both halves of the gesture
 * have to be taken from the page** for the pinch to work at all on a phone -
 * the scroll lock and the overlay's `touch-action`, each noted where it sits.
 *
 * **Frame sizing is the part to leave alone**: the slide is capped to an
 * Instagram-style 4:5 or 5:4 box chosen from the *most portrait* photo in the
 * set, so a column of pictures of wildly different shapes still occupies one
 * stable rectangle beside the text instead of resizing the whole row on every
 * slide change.
 *
 * Each photo may carry its own `fit` and `backgroundColor`: a plate authored as
 * `contain` (an illustration, a range map) must not be cropped to fill the
 * frame, and what shows around it is that record's own colour.
 *
 * ⚠ **Every string is a prop, defaulting to English** - this package is
 * i18n-agnostic, exactly like `ConfirmationModal` and `OsmMap`, so a localised
 * app passes `labels` from its own `Gallery` namespace.
 *
 * ⚠ **The six icons are read from the consuming app's `public/icons/`** -
 * `fullscreen`, `prev`, `next`, `close`, `zoom-in`, `zoom-out`. An app adopting
 * this component must carry all six, or the buttons render empty.
 */

/** One photograph in the set. */
export interface GalleryImage {
  url: string;
  alt: string;
  /**
   * How this photo sits in the frame (`cover` when omitted, so a gallery whose
   * records carry no such field needs nothing); `backgroundColor` is what shows
   * around a `contain` one.
   */
  fit?: CSSProperties["objectFit"];
  backgroundColor?: string | null;
}

/** Every string the gallery renders. All default to English. */
export interface ImageGalleryLabels {
  /** The fullscreen button on the slide, and the overlay's own accessible name. */
  expand?: string;
  previous?: string;
  next?: string;
  close?: string;
  zoomIn?: string;
  zoomOut?: string;
  /** Names the fullscreen pagination row for a screen reader. */
  pagination?: string;
}

export interface ImageGalleryProps {
  images: GalleryImage[];
  /** Painted behind an empty gallery and behind a `contain` photo. */
  placeholderColor?: string | null;
  labels?: ImageGalleryLabels;
  className?: string;
}

const DEFAULT_LABELS: Required<ImageGalleryLabels> = {
  expand: "Expand image",
  previous: "Previous",
  next: "Next",
  close: "Close fullscreen",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  pagination: "Choose a photo",
};

/** The two frames a slide can be capped to - see `slideAspectRatio` below. */
const PORTRAIT_FRAME = 4 / 5; // 0.8
const LANDSCAPE_FRAME = 5 / 4; // 1.25

/** How far a fullscreen photo may be magnified - see the note above. */
const MAX_ZOOM = 3;

export function ImageGallery({
  images,
  placeholderColor,
  labels,
  className,
}: ImageGalleryProps) {
  const t = { ...DEFAULT_LABELS, ...labels };
  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null);
  const [mainSwiper, setMainSwiper] = useState<SwiperType | null>(null);
  const [slideAspectRatio, setSlideAspectRatio] = useState<number | null>(null);
  const [imageAspectRatios, setImageAspectRatios] = useState<(number | null)[]>(
    [],
  );
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);
  const [fullscreenSwiper, setFullscreenSwiper] = useState<SwiperType | null>(
    null,
  );
  const [isClosing, setIsClosing] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  // The page must not scroll under the viewer - see the note on the overlay's
  // `touchAction` below for the half of this that a lock alone doesn't buy.
  useScrollLock(fullscreenIndex !== null);

  const closeFullscreen = useCallback(() => {
    if (isClosing) return;
    setIsClosing(true);
    const lastIndex = fullscreenIndex;
    setTimeout(() => {
      // The reader left fullscreen on a slide they chose - the strip behind it
      // follows, rather than snapping back to the one they opened.
      if (lastIndex !== null) mainSwiper?.slideToLoop(lastIndex);
      setFullscreenIndex(null);
      setFullscreenSwiper(null);
      setIsClosing(false);
      setIsZoomed(false);
    }, 250);
  }, [isClosing, fullscreenIndex, mainSwiper]);

  const toggleZoom = useCallback(() => {
    fullscreenSwiper?.zoom.toggle();
  }, [fullscreenSwiper]);

  const showPrevFullscreen = useCallback(() => {
    fullscreenSwiper?.slidePrev();
  }, [fullscreenSwiper]);

  const showNextFullscreen = useCallback(() => {
    fullscreenSwiper?.slideNext();
  }, [fullscreenSwiper]);

  useEffect(() => {
    if (fullscreenIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeFullscreen();
      if (e.key === "ArrowLeft") showPrevFullscreen();
      if (e.key === "ArrowRight") showNextFullscreen();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    fullscreenIndex,
    closeFullscreen,
    showPrevFullscreen,
    showNextFullscreen,
  ]);

  useEffect(() => {
    if (images.length === 0) return;
    Promise.all(
      images.map((img) => getImageDimensionsFromUrl(img.url).catch(() => null)),
    ).then((results) => {
      setImageAspectRatios(results.map((r) => r?.aspectRatio ?? null));
      const ratios = results
        .filter((r) => r !== null)
        .map((r) => r.aspectRatio);
      if (ratios.length === 0) return;
      // "The large image" is the most-portrait (smallest width/height ratio)
      // one, which drives the slide size. Cap the slide to an Instagram-style
      // frame based on that reference image's orientation: a 4:5 (portrait)
      // frame when it's portrait, a 5:4 (landscape) frame otherwise.
      const referenceRatio = Math.min(...ratios);
      setSlideAspectRatio(
        referenceRatio < 1 ? PORTRAIT_FRAME : LANDSCAPE_FRAME,
      );
    });
  }, [images]);

  if (images.length === 0) {
    return (
      <Box
        className={className}
        width="100%"
        borderRadius={8}
        styles={{
          aspectRatio: "1 / 1",
          backgroundColor: placeholderColor ?? "var(--surface-1, #e0e0e0)",
        }}
      />
    );
  }

  return (
    <Card
      className={className}
      flexDirection="column"
      gap={8}
      width="100%"
      padding={8}
    >
      <Box width="100%" styles={{ position: "relative" }}>
        <Swiper
          modules={[Thumbs, FreeMode]}
          onSwiper={setMainSwiper}
          thumbs={{
            swiper:
              thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null,
          }}
          loop={images.length > 1}
          spaceBetween={15}
          className="ui-gallery__main"
        >
          {images.map((img, i) => (
            <SwiperSlide key={img.url}>
              <Box
                width="100%"
                backgroundColor={
                  img.backgroundColor ??
                  placeholderColor ??
                  "var(--surface-1, #f5f5f5)"
                }
                styles={{
                  position: "relative",
                  overflow: "hidden",
                  // The slide is capped to the fixed frame derived from the
                  // large image's orientation - see slideAspectRatio above. A
                  // `cover` photo scales up to fill it (cropping its edges); a
                  // `contain` one is letterboxed over its own background, which
                  // is the whole point of the author having chosen `contain`.
                  aspectRatio:
                    slideAspectRatio !== null
                      ? String(slideAspectRatio)
                      : "1 / 1",
                }}
              >
                <Image
                  fill
                  src={img.url}
                  alt={img.alt}
                  sizes="(min-width: 1200px) 40vw, (min-width: 600px) 50vw, 100vw"
                  priority={i === 0}
                  style={{ objectFit: img.fit ?? "cover" }}
                />
                <IconButton
                  icon="/icons/fullscreen.svg"
                  aria-label={t.expand}
                  styles={{
                    position: "absolute",
                    bottom: 8,
                    right: 8,
                    zIndex: 10,
                  }}
                  onClick={() => setFullscreenIndex(i)}
                  kind="success"
                  solid
                />
              </Box>
            </SwiperSlide>
          ))}
        </Swiper>

        {images.length > 1 && (
          <>
            <IconButton
              icon="/icons/prev.svg"
              aria-label={t.previous}
              styles={{
                position: "absolute",
                left: 8,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 10,
              }}
              onClick={() => mainSwiper?.slidePrev()}
              kind="success"
              solid
            />
            <IconButton
              icon="/icons/next.svg"
              aria-label={t.next}
              styles={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 10,
              }}
              onClick={() => mainSwiper?.slideNext()}
              kind="success"
              solid
            />
          </>
        )}
      </Box>

      {images.length > 1 && (
        <Swiper
          modules={[Thumbs, FreeMode]}
          onSwiper={setThumbsSwiper}
          slidesPerView={5}
          spaceBetween={8}
          freeMode
          watchSlidesProgress
          className="ui-gallery__thumbs"
        >
          {images.map((img) => (
            <SwiperSlide key={img.url}>
              <Box
                className="ui-gallery__thumb"
                width="100%"
                borderRadius={8}
                backgroundColor={
                  img.backgroundColor ?? "var(--surface-1, #f5f5f5)"
                }
                styles={{
                  position: "relative",
                  aspectRatio: "1 / 1",
                  overflow: "hidden",
                }}
              >
                <Image
                  fill
                  src={img.url}
                  alt={img.alt}
                  sizes="15vw"
                  style={{ objectFit: img.fit ?? "cover" }}
                />
              </Box>
            </SwiperSlide>
          ))}
        </Swiper>
      )}

      {fullscreenIndex !== null && (
        <Box
          className={`ui-gallery__overlay${
            isClosing ? " ui-gallery__overlay--closing" : ""
          }`}
          alignItems="center"
          justifyContent="center"
          styles={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0, 0, 0, 0.75)",
            // ⚠ The overlay claims every touch gesture, which is what makes the
            // pinch reach Swiper's `Zoom`. Every app's `globals.css` puts
            // `touch-action: pan-x pan-y` on `<body>`, so without this the
            // browser answers two fingers by *panning the document* and the
            // photograph never scales - `useScrollLock` above stops the page
            // moving, but a gesture the browser has already claimed is one
            // Swiper never sees. Safe here only because nothing inside the
            // viewer scrolls; don't copy it onto an overlay that has a
            // scrollable panel, where it would kill finger-scrolling.
            touchAction: "none",
          }}
          role="dialog"
          aria-modal
          aria-label={t.expand}
          onClick={closeFullscreen}
        >
          <Box
            className="ui-gallery__overlay-image-wrap"
            flexDirection="column"
            alignItems="center"
            gap={12}
            width="100%"
          >
            <Swiper
              // No `Thumbs`/`FreeMode` here - the fullscreen viewer is the
              // photographs alone, so it needs neither the thumbnail strip nor
              // its free-scrolling.
              modules={[Zoom]}
              zoom={{ maxRatio: MAX_ZOOM, toggle: true }}
              onZoomChange={(_s, scale) => setIsZoomed(scale > 1)}
              onSwiper={setFullscreenSwiper}
              // ⚠ Swiper emits a final `slideChange` as it is torn down (loop
              // mode restores the slide order on destroy), which lands *after*
              // the close has already nulled the index - a plain
              // `setFullscreenIndex(realIndex)` therefore reopened the overlay
              // the instant the close button was pressed. `fullscreenIndex` is
              // the open/closed flag as well as the current slide, so once it
              // is null nothing may write a number back into it.
              onSlideChange={(s) =>
                setFullscreenIndex((i) => (i === null ? null : s.realIndex))
              }
              initialSlide={fullscreenIndex}
              loop={images.length > 1}
              spaceBetween={24}
              className="ui-gallery__fullscreen"
            >
              {images.map((img, i) => (
                <SwiperSlide key={img.url} zoom>
                  <Box
                    // The photograph alone - no frame, no card, no background:
                    // its own aspect ratio inside the height the control row
                    // leaves, so nothing is cropped and nothing is letterboxed
                    // over a plate the reader can see.
                    //
                    // `SwiperSlide zoom` wraps this in Swiper's own
                    // `.swiper-zoom-container` (which fills the slide and
                    // centres us), so the frame below keeps its aspect ratio -
                    // don't move that class onto this box, where the
                    // stylesheet's `height: 100%` would beat the ratio.
                    styles={{
                      position: "relative",
                      width: `min(90vw, calc((90vh - var(--ui-gallery-fs-controls)) * ${
                        imageAspectRatios[i] ?? 1.5
                      }))`,
                      maxHeight: "100%",
                      aspectRatio: String(imageAspectRatios[i] ?? 1.5),
                    }}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  >
                    <Image
                      fill
                      src={img.url}
                      alt={img.alt}
                      sizes="90vw"
                      style={{ objectFit: "contain" }}
                    />
                  </Box>
                </SwiperSlide>
              ))}
            </Swiper>

            {/* The row is inside the overlay, whose click closes it - so a
                press on an arrow, a dot or the magnifier must not reach that
                handler. */}
            <Box
              alignItems="center"
              gap={8}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
            >
              <SliderControls
                count={images.length}
                active={fullscreenIndex}
                onSelect={(i) => fullscreenSwiper?.slideToLoop(i)}
                onPrev={showPrevFullscreen}
                onNext={showNextFullscreen}
                label={t.pagination}
                dotLabel={(i) => images[i]?.alt ?? String(i + 1)}
                previousLabel={t.previous}
                nextLabel={t.next}
                // The row defaults to `width: 100%`, which would push the
                // magnifier off the end of this line.
                width="auto"
              />
              <IconButton
                icon={isZoomed ? "/icons/zoom-out.svg" : "/icons/zoom-in.svg"}
                aria-label={isZoomed ? t.zoomOut : t.zoomIn}
                aria-pressed={isZoomed}
                onClick={toggleZoom}
                kind="success"
                translucent
              />
            </Box>
          </Box>

          <IconButton
            icon="/icons/close.svg"
            aria-label={t.close}
            styles={{ position: "absolute", top: 16, right: 16 }}
            // Without this the press also reaches the overlay's own
            // close-on-backdrop handler, running the whole close twice.
            onClick={(e) => {
              e.stopPropagation();
              closeFullscreen();
            }}
            kind="error"
            solid
          />
        </Box>
      )}
    </Card>
  );
}

export default ImageGallery;
