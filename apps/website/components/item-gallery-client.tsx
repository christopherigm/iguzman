"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Swiper, SwiperSlide } from "swiper/react";
import { Thumbs, Navigation, FreeMode } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import { Box } from "@repo/ui/core-elements/box";
import { Button } from "@repo/ui/core-elements/button";
import getImageDimensionsFromUrl from "@repo/helpers/get-image-dimensions-from-url";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/free-mode";
import "swiper/css/thumbs";
import "./item-gallery-client.css";

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
  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null);
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

  useEffect(() => {
    if (fullscreenIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeFullscreen();
      if (e.key === "ArrowLeft")
        setFullscreenIndex((i) =>
          i === null ? null : (i - 1 + images.length) % images.length,
        );
      if (e.key === "ArrowRight")
        setFullscreenIndex((i) =>
          i === null ? null : (i + 1) % images.length,
        );
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fullscreenIndex, closeFullscreen, images.length]);

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
        borderRadius={12}
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
    <Box flexDirection="column" gap={8} width="100%">
      <Swiper
        modules={[Thumbs, Navigation, FreeMode]}
        thumbs={{
          swiper: thumbsSwiper && !thumbsSwiper.destroyed ? thumbsSwiper : null,
        }}
        navigation
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
              <Button
                unstyled
                className="item-gallery__fullscreen-btn"
                display="flex"
                width={36}
                height={36}
                borderRadius="50%"
                alignItems="center"
                justifyContent="center"
                styles={{ position: "absolute", bottom: 8, right: 8, zIndex: 10 }}
                aria-label="Expand image"
                onClick={() => setFullscreenIndex(i)}
              >
                <Image
                  src="/icons/fullscreen.svg"
                  alt=""
                  width={20}
                  height={20}
                  style={{ filter: "invert(1)" }}
                />
              </Button>
            </Box>
          </SwiperSlide>
        ))}
      </Swiper>

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
          <Button
            unstyled
            className="item-gallery__overlay-close"
            display="flex"
            width={36}
            height={36}
            borderRadius="50%"
            alignItems="center"
            justifyContent="center"
            styles={{ position: "absolute", top: 16, right: 16 }}
            aria-label="Close fullscreen"
            onClick={closeFullscreen}
          >
            <Image
              src="/icons/close.svg"
              alt=""
              width={24}
              height={24}
              style={{ filter: "invert(1)" }}
            />
          </Button>
        </Box>
      )}
    </Box>
  );
}
