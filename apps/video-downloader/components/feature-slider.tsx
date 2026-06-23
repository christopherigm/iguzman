"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Swiper, SwiperSlide } from "swiper/react";
import { Pagination, Autoplay } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { IconButton } from "@repo/ui/core-elements/icon-button";
import { ConfirmationModal } from "@repo/ui/core-elements/confirmation-modal";
import "swiper/css";
import "swiper/css/pagination";
import "./feature-slider.css";

const LS_KEY = "feature-slider-dismissed";

interface FeatureCard {
  key: "offline" | "reelMode" | "subtitles" | "musicPlayer" | "videoEditor";
  src: string;
  width: number;
  height: number;
}

const CARDS: FeatureCard[] = [
  { key: "offline", src: "/banner-offline.jpg", width: 910, height: 360 },
  { key: "reelMode", src: "/banner-reel-mode.jpg", width: 910, height: 360 },
  { key: "subtitles", src: "/banner-subtitles.jpg", width: 910, height: 360 },
  { key: "musicPlayer", src: "/banner-music.jpg", width: 910, height: 360 },
  { key: "videoEditor", src: "/banner-ffmpeg.jpg", width: 910, height: 360 },
];

export function FeatureSlider() {
  const t = useTranslations("FeatureSlider");
  const swiperRef = useRef<SwiperType | null>(null);
  // Seeded from localStorage via lazy init (avoids a mount setState-in-effect).
  const [visible, setVisible] = useState(
    () =>
      typeof window !== "undefined" && localStorage.getItem(LS_KEY) !== "true",
  );
  const [showConfirm, setShowConfirm] = useState(false);

  if (!visible) return null;

  return (
    <>
      <Box maxWidth={400} width="100%" className="fs-wrapper">
        <Box
          elevation={2}
          borderRadius={14}
          className="vi-card"
          flexDirection="column"
          styles={{ overflow: "hidden" }}
        >
          <Swiper
            className="fs-swiper"
            modules={[Pagination, Autoplay]}
            slidesPerView={1}
            spaceBetween={0}
            loop
            autoplay={{ delay: 15000, disableOnInteraction: false }}
            pagination={{ el: ".fs-pagination", clickable: true }}
            onSwiper={(s) => {
              swiperRef.current = s;
            }}
          >
            {CARDS.map((card) => (
              <SwiperSlide key={card.key}>
                <div className="fs-image-wrapper">
                  <Image
                    src={card.src}
                    alt={t(`${card.key}.title`)}
                    width={card.width}
                    height={card.height}
                    className="fs-image"
                  />
                  <IconButton
                    icon="/icons/close.svg"
                    iconSize={14}
                    iconColor="#fff"
                    aria-label={t("close")}
                    onClick={() => setVisible(false)}
                    size="sm"
                    backgroundColor="rgba(0, 0, 0, 0.45)"
                    borderRadius="50%"
                    styles={{ position: "absolute", top: 10, right: 10 }}
                  />
                </div>
                <div className="fs-body">
                  <Typography variant="body" fontWeight={500}>
                    {t(`${card.key}.title`)}
                  </Typography>
                  <Typography variant="body">
                    {t(`${card.key}.body1`)}
                  </Typography>
                  <Typography variant="body">
                    {t(`${card.key}.body2`)}
                  </Typography>
                  <Box marginTop={4}>
                    <Button
                      text={t("dontShowAgain")}
                      onClick={() => setShowConfirm(true)}
                      size="md"
                    />
                  </Box>
                </div>
              </SwiperSlide>
            ))}
          </Swiper>

          <div className="fs-controls">
            <IconButton
              icon="/icons/chevron-left.svg"
              iconSize={18}
              iconColor="rgba(255, 255, 255, 0.7)"
              aria-label={t("prev")}
              onClick={() => swiperRef.current?.slidePrev()}
              width={32}
              height={32}
            />
            <div className="fs-pagination" />
            <IconButton
              icon="/icons/chevron-right.svg"
              iconSize={18}
              iconColor="rgba(255, 255, 255, 0.7)"
              aria-label={t("next")}
              onClick={() => swiperRef.current?.slideNext()}
              width={32}
              height={32}
            />
          </div>
        </Box>
      </Box>

      {showConfirm && (
        <ConfirmationModal
          title={t("dontShowAgainTitle")}
          text={t("dontShowAgainText")}
          okCallback={() => {
            localStorage.setItem(LS_KEY, "true");
            setVisible(false);
            setShowConfirm(false);
          }}
          cancelCallback={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}

export default FeatureSlider;
