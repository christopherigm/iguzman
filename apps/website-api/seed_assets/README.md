# seed_assets/ — placeholder pool + brief inputs for `seed_site`

This directory feeds the **`seed_site`** management command (driven by the
**`/seed-site`** skill). It turns a JSON _brief_ into a customer's initial
`System` + success stories + highlights + product/service catalog, so a freshly
scaffolded site renders **full and alive** — real copy, placeholder images and
links — instead of an empty shell.

> Why here and not in the frontend: the image fields on `System`, `SuccessStory`,
> `CompanyHighlight`, `ProductCategory`/`Product`, `ServiceCategory`/`Service` are
> Django **`ImageField`s** — files under `MEDIA_ROOT`, not URLs. `seed_site`
> copies files from this folder into media and links each record. Only
> `video_link` (YouTube) and `href` are true URLs (see `links.json`).

## What's here

| File                                                                                | Purpose                                                                                                                                  |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `placeholder-1.jpg … placeholder-8.jpg`                                             | **Generic image pool.** Any record whose `image` is omitted round-robins through these, so nothing is ever blank.                        |
| `hero.jpg`, `about.jpg`, `logo.png`, `logo-hero.png`, `favicon.png`, `manifest.png` | Named `System` branding assets (referenced from `system.assets` in the brief). `manifest.png` (1080²) fills all five PWA manifest sizes. |
| `links.json`                                                                        | URL pool: `video_link` (hero YouTube) + `href[]` (story/product outbound links). Used when the brief omits them.                         |
| `brief.example.json`                                                                | A complete, filled example brief — the schema by example.                                                                                |
| `briefs/`                                                                           | Per-customer briefs the `/seed-site` skill writes here as `<host>.json`. Git-ignored.                                                    |
| `exports/`                                                                          | Generated site payloads (`export_site <host> --output …`) consumed by `pnpm publish-site`. Git-ignored.                                  |

**Swap the placeholders for your own dummies at will** — keep the same filenames
(`placeholder-1.jpg` … or add more `placeholder-*`), or point brief `image`
fields at any new file you drop in here.

## Brief schema (by example: `brief.example.json`)

```jsonc
{
  "system": {
    "host": "acme.com",              // REQUIRED — matches System.host / site.config systemHost
    "site_name": "...", "slogan": "...", "site_description": "...",
    "primary_color": "#...", "secondary_color": "#...",
    "about": "...", "mission": "...", "vision": "...",
    "highlights_title": "...", "highlights_subtitle": "...",
    "highlights_bg": "...", "catalog_items_bg": "...",
    "google_font_url": "https://fonts.googleapis.com/css2?family=A&family=B&display=swap",
    "font_display": "A", "font_body": "B",   // headings / body; both must be in the URL above
    "video_link": "https://youtube...",     // optional; falls back to links.json

    // --- contact details (feed the shared /contact page + the footer) ---
    "contact_email": "hola@acme.com",
    "social_links": [ { "platform": "instagram", "url": "https://..." } ],
    // NOTE: physical `Branch` locations are NOT seedable — add them in /admin/branches.

    // --- hero composition & darkening (all optional; CMS-tunable) ---
    "hero_video_layout": "default",          // default | none | profile
    "hero_logo_background": "none",          // badge shape behind the hero logo
    "hero_logo_scale": 100, "hero_logo_background_scale": 100,   // whole percent, 30-100
    "hero_overlay_style": "bottom",          // none | full | bottom | top | both | vignette
    "hero_overlay_opacity": 75,              // whole percent — how DARK it gets
    "hero_overlay_extent": 50,               // whole percent — how FAR it reaches (no effect on `full`)
    "hero_text_frame": false,                // outline frame on SECTION heroes, not the landing

    // --- shape dividers: wave|scallop|zigzag|spikes|arches|slant|inverted-slant|none ---
    "hero_bottom_divider": "none", "hero_bottom_divider_elevation": 10,
    "catalog_top_divider": "none", "catalog_bottom_divider": "none",
    "highlights_top_divider": "none", "highlights_bottom_divider": "none",

    // --- watermark + page background (values below are the model defaults) ---
    "watermark_enabled": false, "watermark_rotation": -12,   // degrees, -45..45
    "watermark_size": 120,          // drawn width of one logo, px
    "watermark_spacing": 70,        // empty space between logos, px
    "watermark_opacity": 4,         // whole percent, 1-25
    "watermark_intercalated": false,   // neighbours lean opposite ways
    "watermark_show_logo": true,       // tiles img_logo
    "watermark_show_brandmark": false, // tiles img_brandmark (needs one uploaded)
    "background_light": "#e5e5e5", "background_dark": "#3c3c3c",

    // --- spotlight promo panel (the trio of ITEMS is picked in the CMS, not seeded) ---
    "spotlight_enabled": true, "spotlight_label": "...", "spotlight_title": "...",
    "spotlight_text": "...", "spotlight_button_label": "...", "spotlight_button_link": "/...",

    // --- legal copy the footer links ---
    "privacy_policy": "...", "terms_and_conditions": "...", "user_data": "...",

    // Any `en_*` mirror field (en_about, en_site_description, en_spotlight_title, …)
    // is copied when present.
    "assets": {                              // filenames in this folder; all optional
      "img_logo": "logo.png", "img_logo_hero": "logo-hero.png",
      "img_favicon": "favicon.png", "img_manifest": "manifest.png",
      "img_hero": "hero.jpg", "img_about": "about.jpg"
    }
  },
  "success_stories": [ { "name", "short_description", "description", "href?", "image?", "gallery?": [] } ],
  "highlights":      [ { "name", "category", "description", "icon?", "size?", "image?", "items?": [ { "name","description","icon?","image?" } ] } ],
  "product_categories": [ { "name", "image?", "products":  [ { "name","description","price","currency?","is_featured?","image?","gallery?":[] } ] } ],
  "service_categories": [ { "name", "image?", "services":  [ { "name","description","price","currency?","modality?","duration?","is_featured?","image?" } ] } ],
  "menu_categories":    [ { "name", "image?", "menu_items": [ { "name","description","price","currency?","kind?","is_featured?","is_organic?","is_vegetarian?","is_vegan?","is_gluten_free?","allergens?","portions?","image?","gallery?":[],
                            "ingredients": [ { "name","price","calories?","is_removable?","max_quantity?","quantity?","unit?","sort_order?" } ] } ] } ]
}
```

Notes:

- **`core/site_payload.SYSTEM_TEXT_FIELDS` is the authoritative list** of what
  `brief["system"]` may carry — `seed_site` copies **every** field in that tuple
  verbatim when present, and `export_site`/`publish-site` serialize the same set.
  The block above is its prose summary; if the two ever disagree, the tuple wins.
- **Three things the brief deliberately cannot create:** `spotlight_items` (the
  Spotlight's three picks — item ids are per-database, so they're chosen in
  `/admin/featured-spotlight`), physical `Branch` locations (`/admin/branches`),
  and `MenuItem.recipe_steps` (kitchen IP, maintained in the CMS).
- Products/services/menu items default to `is_featured: true` so they show in
  the `CatalogItems` block (which requests `?featured=true`).
- `menu_categories` seed the food (MenuItem) family — priced-ingredient
  customisation. Each `menu_items[].ingredients[]` row is either **included by
  default** (`is_removable: false` — the default — part of the base `price`,
  locked into the dish, shown as "Included") or an **add-on**
  (`is_removable: true`, `price` charged per selected unit up to `max_quantity`,
  starting at 0). `quantity`/`unit` are the descriptive recipe portion (display
  only) and never affect price. A `menu_item`'s optional `portions` (servings the
  dish yields) drives the per-serving figures on the nutrition label. See
  `catalog/models.py` → MenuItem / MenuItemIngredient.
- **`menu_items[].kind`** says what the item *is* — `"food"` (the default),
  `"drink"`, `"dessert"`, `"side"` or `"appetizer"`. Set it rather than relying on
  the category's name: it is the structural field the storefront filters on (a
  bar/drinks list asks the API for `?kind=drink`), and category names are
  free-form tenant copy that a customer may rename at any time. It travels with
  `publish-site`, so a seeded menu keeps its kinds in production.
- Slugs are auto-generated and **host-namespaced** (`<host-token>-<slug>`) so two
  seeded sites never collide on the globally-unique slug fields.
- `price` is a string/number → `Decimal`; `currency` is a 3-letter code (USD default).

## Running

```bash
cd apps/website-api
python manage.py seed_site --brief seed_assets/briefs/acme.json --reset
#   --reset       wipe this System's prior seeded content first (idempotent re-runs)
#   --assets-dir  override this folder
```

`--reset` deletes only the stories/highlights/catalog owned by that `System`;
the `System` record itself is upserted (created if missing, else updated).

## Publishing to production

`seed_site` populates the **local** DB. Once a site is tested, push its content
to production with `pnpm publish-site <host>`, which runs `export_site` (serialize
the System + content from the local DB into `exports/<host>.json`, images omitted)
and POSTs it to the prod `/api/publish-site/` endpoint. See `core/site_payload.py`
and `apps/website/sites/CLAUDE.md` → "Publishing to production".
