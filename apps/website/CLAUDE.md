# website — App-Specific Conventions

## Shared utility classes in `app/globals.css`

| Class | Use for |
|---|---|
| `.section-title` | `<h2>` (or any heading) that titles a page section |
| `.section-subtitle` | Supporting paragraph beneath a section title |
| `.zoom-on-hover` | Card container with `overflow: hidden` — scales inner `<img>` to 1.1× on hover |
| `.card-content` | Inner content wrapper of any card — standard padding (`16px` vertical, `10px` horizontal) |
| `.elevation-<1–24>` | Box shadow matching `Box elevation={n}` — use on any element (Link, div, etc.) to apply the same shadow scale |
| `.item-price` | Large, bold price display for product/service detail pages |
| `.item-compare-price` | Muted, line-through compare price for detail pages |
| `.item-discount-badge` | Small red inline badge showing percentage off (e.g., `-20%`) |
| `.item-stock-in` | Green "In Stock" indicator text |
| `.item-stock-out` | Red "Out of Stock" indicator text |
| `.item-specs-table` | Full-width spec/detail table with alternating borders and label column |
| `.item-section-heading` | `<h2>` section heading inside a detail page (description, specs, etc.) |

```tsx
<Typography as="h2" variant="h2" className="section-title">{title}</Typography>
<Typography variant="none" className="section-subtitle">{subtitle}</Typography>
```

When adding a new shared utility class to `globals.css`, update this table so the catalogue stays current.

## Shared Constants — Don't Duplicate Across Sibling Files

Before defining a constant, type, or pure utility function in a component file, check whether it already exists in a shared file in the same directory. If the same value appears (or is about to appear) in two or more sibling files, extract it into a dedicated shared module in their common parent directory.

**Current shared files to check first:**

| File | Contents |
|---|---|
| `apps/website/components/admin/paragraph-options.ts` | `PARAGRAPH_WORD_COUNTS`, `PARAGRAPH_LENGTH_STEPS`, `PARAGRAPH_COUNT_STEPS` — used by `admin-form.tsx` and `ai-interviewer/ai-interviewer.tsx` |

**How to apply:**
1. Before writing a new constant in any file under `apps/website/components/admin/`, grep for it across sibling files first.
2. If it already exists in a shared file, import it. If it exists in a sibling but not yet extracted, move it to the appropriate shared file and update both importers.
3. When creating a new shared file, name it after what it contains (`paragraph-options.ts`, `field-utils.ts`, etc.) — not after a consumer (`admin-form-helpers.ts`).
