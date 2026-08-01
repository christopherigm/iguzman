declare module "*.css" {
  const content: { [className: string]: string };
  export default content;
}

// `swiper/css` and its per-module subpaths are side-effect CSS imports with no
// type declarations of their own (`image-gallery.tsx` pulls in four of them).
// They do not match the `*.css` pattern above - the specifier ends in `/css`,
// not `.css` - so they need their own entries. Each app in `apps/` carries the
// same pair in its own root `css.d.ts`.
declare module "swiper/css";
declare module "swiper/css/*";
