import { useState } from "react";
import { Focusable } from "@repo/ui-tv/focusable";
import { TvButton } from "@repo/ui-tv/tv-button";
import { TvTextInput } from "@repo/ui-tv/tv-text-input";
import { TvText } from "@repo/ui-tv/tv-typography";
import { launchDigitalCopy } from "@/lib/launch-app";
import { useT } from "@/i18n/provider";

export function Home() {
  const { t } = useT();
  const [query, setQuery] = useState("");

  return (
    <Focusable group focusOnMount>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 40,
          maxWidth: 1100,
        }}
      >
        <TvText variant="hero">{t("homeTitle")}</TvText>

        <TvTextInput
          ariaLabel={t("search")}
          placeholder={t("search")}
          value={query}
          onChange={setQuery}
        />

        <div style={{ display: "flex", gap: 24 }}>
          <TvButton
            onPress={() =>
              launchDigitalCopy("https://www.youtube.com/watch?v=vCCamwjcumM")
            }
          >
            {t("openYoutube")} peli xd
          </TvButton>
        </div>
      </div>
    </Focusable>
  );
}
