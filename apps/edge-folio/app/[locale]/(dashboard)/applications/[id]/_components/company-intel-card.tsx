"use client";

import { useRef, useId } from "react";
import { useTranslations } from "next-intl";
import { Box } from "@repo/ui/core-elements/box";
import { Card } from "@repo/ui/core-elements/card";
import { Typography } from "@repo/ui/core-elements/typography";
import { Button } from "@repo/ui/core-elements/button";
import { Spinner } from "@repo/ui/core-elements/spinner";
import { Swiper, SwiperSlide } from "swiper/react";
import { Pagination } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import type { CompanyIntelItem } from "@/lib/applications";
import "swiper/css";
import "swiper/css/pagination";

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
  const id = useId();
  const pagClass = `detail__intel-pag-${id.replace(/:/g, "")}`;

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
            modules={[Pagination]}
            slidesPerView={1}
            spaceBetween={0}
            loop={items.length > 1}
            onSwiper={(s) => {
              swiperRef.current = s;
            }}
            pagination={
              items.length > 1
                ? { el: `.${pagClass}`, clickable: true }
                : undefined
            }
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
          {items.length > 1 && (
            <div className="detail__intel-controls">
              <Button
                icon="/icons/chevron-left.svg"
                iconSize="16px"
                aria-label={t("intelNavPrev")}
                onClick={() => swiperRef.current?.slidePrev()}
                width={28}
                height={28}
                border="1px solid var(--border, #e5e7eb)"
                styles={{ padding: 0, justifyContent: "center" }}
              />
              <div className={pagClass} data-intel-pagination />
              <Button
                icon="/icons/chevron-right.svg"
                iconSize="16px"
                aria-label={t("intelNavNext")}
                onClick={() => swiperRef.current?.slideNext()}
                width={28}
                height={28}
                border="1px solid var(--border, #e5e7eb)"
                styles={{ padding: 0, justifyContent: "center" }}
              />
            </div>
          )}
        </>
      )}
    </Card>
  );
}
