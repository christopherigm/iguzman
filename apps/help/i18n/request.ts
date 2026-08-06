import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
// This app's own en/es routing, not the shared five-locale one - see ./routing.ts.
import { routing } from "./routing";
import { getSharedMessages } from "@repo/i18n/request";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  // The shared catalogue still carries all five locales (other apps use them);
  // only this app's own messages/ directory is narrowed to en + es.
  const [sharedMessages, localMessages] = await Promise.all([
    getSharedMessages(locale),
    import(`../messages/${locale}.json`).then((m) => m.default),
  ]);

  return { locale, messages: { ...sharedMessages, ...localMessages } };
});
