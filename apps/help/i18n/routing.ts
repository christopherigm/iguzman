import { defineRouting } from "next-intl/routing";

/**
 * The help app's **own** locale set - deliberately narrower than the monorepo's.
 *
 * `@repo/i18n/routing` ships five locales (de/en/es/fr/pt) because the customer
 * -facing apps need them. This app is internal developer documentation written
 * and maintained in English, with a Spanish translation of the navigation
 * chrome; the German, French and Portuguese catalogues were machine-produced
 * and proofread by nobody, so they were removed rather than left to rot.
 *
 * Anything that is not Spanish resolves to English: `defaultLocale` is `en`, and
 * next-intl's Accept-Language negotiation can only match a locale in this list -
 * so a `fr` browser lands on `/en` rather than a half-translated `/fr`.
 *
 * ⚠ **Use this `routing`, not `@repo/i18n/routing`, anywhere the locale *set*
 * matters** - the middleware, `generateStaticParams`, the `hasLocale` guard in
 * the layout, and the footer's `LocaleSwitcher`. Importing the shared one there
 * re-opens `/de`, `/fr` and `/pt`, which now have no message catalogue behind
 * them and would render as raw key names.
 *
 * `@repo/i18n/navigation`'s `Link`/`useRouter` stay shared and are still the
 * right import for every internal link (they are what `@repo/ui`'s `Box`,
 * `Button` and `Breadcrumbs` render internally). They only ever prefix the
 * locale currently being rendered, and the middleware here can no longer
 * produce anything but `en` or `es` - so the wider set is unreachable, not
 * wrong.
 */
export const routing = defineRouting({
  locales: ["en", "es"] as const,
  defaultLocale: "en",
});
