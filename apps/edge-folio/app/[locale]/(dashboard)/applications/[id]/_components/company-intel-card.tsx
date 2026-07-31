"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Spinner } from "@repo/ui/core-elements/spinner";
import { SliderControls } from "@repo/ui/core-elements/slider-dots";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperType } from "swiper";
import type { CompanyIntelItem } from "@/lib/applications";
import "swiper/css";

function IntelItemCard({ item }: { item: CompanyIntelItem }) {
  return (
    <Box display="flex" flexDirection="column" gap={4}>
      <Typography variant="body" fontWeight={600} styles={{ lineHeight: 1.4 }}>
        {item.title}
      </Typography>
      <Typography
        as="p"
        variant="body"
        styles={{ lineHeight: 1.6, wordBreak: "break-word" }}
      >
        {item.summary}
      </Typography>
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="detail__url"
      >
        {item.source} ↗
      </a>
    </Box>
  );
}

export function IntelSwiperCard({
  title,
  items,
  loading,
}: {
  title: string;
  items: CompanyIntelItem[];
  loading?: boolean;
}) {
  const t = useTranslations("ApplicationDetailPage");
  const swiperRef = useRef<SwiperType | null>(null);
  // `realIndex`, not `activeIndex`: the slider loops once there is more than one
  // item, so Swiper prepends duplicates and only the former indexes into `items`.
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <Card padding={0} styles={{ overflow: "hidden" }}>
      <Box paddingX={14} paddingTop={14} paddingBottom={10}>
        <Typography variant="body" fontWeight={600} color="var(--foreground)">
          {title}
        </Typography>
      </Box>
      {loading ? (
        <Box
          display="flex"
          alignItems="center"
          justifyContent="center"
          padding={24}
        >
          <Spinner size={16} />
        </Box>
      ) : (
        <>
          <Swiper
            className="detail__intel-swiper"
            slidesPerView={1}
            spaceBetween={0}
            loop={items.length > 1}
            onSwiper={(s) => {
              swiperRef.current = s;
            }}
            onSlideChange={(s) => setActiveIndex(s.realIndex)}
          >
            {items.map((item, i) => (
              <SwiperSlide key={i}>
                <Box
                  paddingX={14}
                  paddingBottom={14}
                  display="flex"
                  flexDirection="column"
                  gap={4}
                >
                  <IntelItemCard item={item} />
                </Box>
              </SwiperSlide>
            ))}
          </Swiper>
          {/* The shared control row (`@repo/ui`): arrows flanking accent dots.
              It renders nothing for a single item, so the strip's own border
              only appears when there is something to page. `translucentArrows`
              is off - the row sits on the card's opaque body. */}
          {items.length > 1 && (
            <Box className="detail__intel-controls">
              <SliderControls
                count={items.length}
                active={activeIndex}
                // `slideToLoop` indexes the real items, past the duplicates the
                // looping slider prepends.
                onSelect={(i) => swiperRef.current?.slideToLoop(i)}
                onPrev={() => swiperRef.current?.slidePrev()}
                onNext={() => swiperRef.current?.slideNext()}
                label={t("intelPagination")}
                dotLabel={(i) => items[i]!.title}
                previousLabel={t("intelNavPrev")}
                nextLabel={t("intelNavNext")}
                arrowSize="sm"
                translucentArrows={false}
              />
            </Box>
          )}
        </>
      )}
    </Card>
  );
}
