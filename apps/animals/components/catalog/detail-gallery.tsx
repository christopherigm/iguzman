"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Swiper, SwiperSlide } from "swiper/react";
import { Thumbs, FreeMode } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import getImageDimensionsFromUrl from "@repo/helpers/get-image-dimensions-from-url";
import type { ImageFit } from "@/lib/catalog";
import "swiper/css";
import "swiper/css/free-mode";
import "swiper/css/thumbs";
import "./detail-gallery.css";

/**
 * A detail page's photographs as a mounted slideshow: one large slide with a
 * strip of thumbnails under it and a fullscreen viewer, sitting beside the
 * description and the facts card in the page's first row.
 *
 * **All three detail routes share it** - a category, a species and a journal
 * entry each show their photographs this way, which is what makes their first
 * row one object rather than three. It replaced the multi-up contact sheet the
 * category and sighting pages used to carry below the fold.
 *
 * This is a port of `apps/website`'s `ItemGalleryClient` (the menu/product detail
 * gallery), kept deliberately close to it so the two read as one design - most of
 * all its **frame sizing**: the slide is capped to an Instagram-style 4:5 or 5:4
 * box chosen from the *most portrait* photo in the set, so a column of pictures
 * of wildly different shapes still occupies one stable rectangle beside the text
 * instead of resizing the whole row on every slide change.
 *
 * Unlike the website's copy it honours each photo's own `fit` and
 * `backgroundColor`, which every catalog record here carries: a plate authored as
 * `contain` (an illustration, a range map) must not be cropped to fill the frame.
 *
 * Not to be confused with `app/[locale]/species-gallery.tsx`, the landing page's
 * own full-bleed strip.
 */

export interface GalleryImage {
  url: string;
  alt: string;
  /** The record's own `fit`; `backgroundColor` is what shows around it. */
  fit?: ImageFit;
  backgroundColor?: string | null;
}

interface Props {
  images: GalleryImage[];
  /** Painted behind an empty gallery and behind a `contain` photo. */
  placeholderColor?: string | null;
}

/** The two frames a slide can be capped to - see `slideAspectRatio` below. */
const PORTRAIT_FRAME = 4 / 5; // 0.8
const LANDSCAPE_FRAME = 5 / 4; // 1.25

export function DetailGallery({ images, placeholderColor }: Props) {
  const t = useTranslations("Gallery");
  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null);
  const [mainSwiper, setMainSwiper] = useState<SwiperType | null>(null);
  const [slideAspectRatio, setSlideAspectRatio] = useState<number | null>(null);
  const [imageAspectRatios, setImageAspectRatios] = useState<(number | null)[]>(
    [],
  );
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  const closeFullscreen = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setFullscreenIndex(null);
      setIsClosing(false);
    }, 250);
  }, []);

  const showPrevFullscreen = useCallback(() => {
    setFullscreenIndex((i) =>
      i === null ? null : (i - 1 + images.length) % images.length,
    );
  }, [images.length]);

  const showNextFullscreen = useCallback(() => {
    setFullscreenIndex((i) => (i === null ? null : (i + 1) % images.length));
  }, [images.length]);

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
        width="100%"
        borderRadius={8}
        styles={{
          aspectRatio: "1 / 1",
          backgroundColor: placeholderColor ?? "var(--surface-1, #e0e0e0)",
        }}
      />
    );
  }

  const fullscreenAr =
    fullscreenIndex !== null
      ? (imageAspectRatios[fullscreenIndex] ?? 1.5)
      : 1.5;

  return (
    <Card flexDirection="column" gap={8} width="100%" padding={8}>
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
          className="detail-gallery__main"
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
                  aria-label={t("expand")}
                  styles={{
                    position: "absolute",
                    bottom: 8,
                    right: 8,
                    zIndex: 10,
                  }}
                  onClick={() => setFullscreenIndex(i)}
                  kind="success"
                  translucent
                />
              </Box>
            </SwiperSlide>
          ))}
        </Swiper>

        {images.length > 1 && (
          <>
            <IconButton
              icon="/icons/prev.svg"
              aria-label={t("previous")}
              styles={{
                position: "absolute",
                left: 8,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 10,
              }}
              onClick={() => mainSwiper?.slidePrev()}
              kind="success"
              translucent
            />
            <IconButton
              icon="/icons/next.svg"
              aria-label={t("next")}
              styles={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 10,
              }}
              onClick={() => mainSwiper?.slideNext()}
              kind="success"
              translucent
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
          className="detail-gallery__thumbs"
        >
          {images.map((img) => (
            <SwiperSlide key={img.url}>
              <Box
                className="detail-gallery__thumb"
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
          className={`detail-gallery__overlay${
            isClosing ? " detail-gallery__overlay--closing" : ""
          }`}
          alignItems="center"
          justifyContent="center"
          styles={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            background: "rgba(0, 0, 0, 0.75)",
          }}
          role="dialog"
          aria-modal
          aria-label={t("expand")}
          onClick={closeFullscreen}
        >
          <Box
            className="detail-gallery__overlay-image-wrap"
            styles={{
              position: "relative",
              width: `min(90vw, calc(90vh * ${fullscreenAr}))`,
              maxHeight: "90vh",
              aspectRatio: String(fullscreenAr),
            }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <Image
              fill
              src={images[fullscreenIndex]?.url ?? ""}
              alt={images[fullscreenIndex]?.alt ?? ""}
              sizes="90vw"
              style={{ objectFit: "contain" }}
            />
          </Box>

          {images.length > 1 && (
            <>
              <IconButton
                icon="/icons/prev.svg"
                aria-label={t("previous")}
                styles={{
                  position: "absolute",
                  left: 16,
                  top: "50%",
                  transform: "translateY(-50%)",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  showPrevFullscreen();
                }}
                kind="success"
                translucent
              />
              <IconButton
                icon="/icons/next.svg"
                aria-label={t("next")}
                styles={{
                  position: "absolute",
                  right: 16,
                  top: "50%",
                  transform: "translateY(-50%)",
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  showNextFullscreen();
                }}
                kind="success"
                translucent
              />
            </>
          )}

          <IconButton
            icon="/icons/close.svg"
            aria-label={t("close")}
            styles={{ position: "absolute", top: 16, right: 16 }}
            onClick={closeFullscreen}
            kind="error"
            translucent
          />
        </Box>
      )}
    </Card>
  );
}
