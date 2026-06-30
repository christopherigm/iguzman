import { useCallback, useEffect, useState } from "react";
import { Focusable } from "@repo/ui-tv/focusable";
import { TvText } from "@repo/ui-tv/tv-typography";
import { WEB_URL } from "@/lib/config";
import {
  requestDeviceCode,
  pollToken,
  setSession,
  type DeviceCode,
} from "@/lib/auth";
import { useT } from "@/i18n/provider";
import "./pairing.css";

type Status = "loading" | "ready" | "error";

// Where the user enters the code, shown without the protocol for readability.
const ENTER_URL = `${WEB_URL.replace(/^https?:\/\//, "")}/tv`;

export function Pairing({ onPaired }: { onPaired: () => void }) {
  const { t } = useT();
  const [status, setStatus] = useState<Status>("loading");
  const [userCode, setUserCode] = useState("");
  // Bumping this restarts the whole flow with a fresh code (expiry or retry).
  const [attempt, setAttempt] = useState(0);

  const restart = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    let active = true;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;

    async function start() {
      setStatus("loading");
      let dc: DeviceCode;
      try {
        dc = await requestDeviceCode();
      } catch {
        if (active) setStatus("error");
        return;
      }
      if (!active) return;
      setUserCode(dc.user_code);
      setStatus("ready");

      const poll = async () => {
        if (!active) return;
        try {
          const result = await pollToken(dc.device_code);
          if (!active) return;
          if (result.status === "authorized") {
            setSession(result.access, result.refresh);
            onPaired();
            return;
          }
          if (result.status === "expired") {
            restart();
            return;
          }
        } catch {
          // Transient network blip - keep polling on the next tick.
        }
        pollTimer = setTimeout(poll, dc.interval * 1000);
      };
      pollTimer = setTimeout(poll, dc.interval * 1000);

      // If the code lapses before the user enters it, request a new one.
      expiryTimer = setTimeout(() => {
        if (active) restart();
      }, dc.expires_in * 1000);
    }

    start();
    return () => {
      active = false;
      if (pollTimer) clearTimeout(pollTimer);
      if (expiryTimer) clearTimeout(expiryTimer);
    };
  }, [attempt, onPaired, restart]);

  return (
    <div className="pairing">
      <TvText variant="hero">{t("pairTitle")}</TvText>

      {status === "loading" && (
        <TvText variant="body" className="pairing__hint">
          {t("loading")}
        </TvText>
      )}

      {status === "error" && (
        <div className="pairing__error">
          <TvText variant="body">{t("pairError")}</TvText>
          <Focusable
            focusOnMount
            onEnterPress={restart}
            className="pairing__button"
          >
            <TvText variant="body">{t("retry")}</TvText>
          </Focusable>
        </div>
      )}

      {status === "ready" && (
        <>
          <TvText variant="body" className="pairing__hint">
            {t("pairStep1")}
          </TvText>
          <div className="pairing__url">
            <TvText variant="title">{ENTER_URL}</TvText>
          </div>
          <TvText variant="body" className="pairing__hint">
            {t("pairStep2")}
          </TvText>
          <div className="pairing__code" aria-label={userCode}>
            {userCode}
          </div>
          <TvText variant="label" className="pairing__hint">
            {t("pairWaiting")}
          </TvText>
        </>
      )}
    </div>
  );
}
