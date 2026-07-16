"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Swiper, SwiperSlide } from "swiper/react";
import { Thumbs, FreeMode } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import { Box } from "@repo/ui/core-elements/box";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import getImageDimensionsFromUrl from "@repo/helpers/get-image-dimensions-from-url";
import "swiper/css";
import "swiper/css/free-mode";
import "swiper/css/thumbs";
import "./item-gallery-client.css";
import Card from "@repo/ui/core-elements/card";

export interface GalleryImage {
  url: string;
  alt: string;
}

interface ItemGalleryClientProps {
  images: GalleryImage[];
  placeholderColor?: string;
}

export function ItemGalleryClient({
  images,
  placeholderColor,
}: ItemGalleryClientProps) {
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
        .map((r) => r!.aspectRatio);
      if (ratios.length === 0) return;
      // Use the most-portrait (smallest width/height ratio) so the tallest
      // image fills the slide without letterboxing.
      setSlideAspectRatio(Math.min(...ratios));
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
          className="item-gallery__main"
        >
          {images.map((img, i) => (
            <SwiperSlide key={i}>
              <Box
                width="100%"
                maxHeight="clamp(320px, 50vh, 520px)"
                styles={{
                  position: "relative",
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
                  style={{ objectFit: "contain" }}
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
          className="item-gallery__thumbs"
        >
          {images.map((img, i) => (
            <SwiperSlide key={i}>
              <Box
                className="item-gallery__thumb"
                width="100%"
                borderRadius={8}
                backgroundColor="var(--surface-1, #f5f5f5)"
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
                  style={{ objectFit: "cover" }}
                />
              </Box>
            </SwiperSlide>
          ))}
        </Swiper>
      )}

      {fullscreenIndex !== null && (
        <Box
          className={`item-gallery__overlay${isClosing ? " item-gallery__overlay--closing" : ""}`}
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
          aria-label="Image fullscreen"
          onClick={closeFullscreen}
        >
          <Box
            className="item-gallery__overlay-image-wrap"
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
