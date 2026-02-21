# Horoscope App — Style Guide for LLM Prompting

Use this document as the authoritative reference when adding new sections or components to this app.
All class names use the `dk-` prefix. All styles live in `apps/horoscope/app/globals.css`.

---

## Fonts

| Role | Font | Usage |
|------|------|-------|
| Display / headings | `'Pacifico', cursive` | Section titles, hero headline, card titles |
| Body / UI | `'Nunito', sans-serif` | Body copy, buttons, labels, tags, descriptions |

---

## Color Palette (CSS Variables)

| Variable | Hex | Meaning |
|----------|-----|---------|
| `--dk-lilac` | `#c8a0e8` | Primary accent — purple |
| `--dk-rose` | `#f0a0c8` | Secondary accent — pink |
| `--dk-sky` | `#80c8f8` | Tertiary accent — blue |
| `--dk-mint` | `#a0e8d0` | Quaternary accent — teal |
| `--dk-peach` | `#f8c0a0` | Warm accent — peach |
| `--dk-deep` | `#3d1c60` | Dark text, headings, deep purple |
| `--dk-ink` | `#2d1248` | Darkest text (feature card titles) |
| `--dk-cream` | `#fffaf6` | Light neutral background |

Body text uses `rgba(61, 28, 96, 0.55–0.72)` — a soft semi-transparent deep purple.

---

## Page Shell (Required Wrapper Structure)

Every page must use this wrapper to get the animated gradient background, floating orbs, and sparkle stars:

```tsx
<div className="dk">
  {/* Animated background orbs — place these first, always */}
  <div className="dk-orb dk-orb-1" />
  <div className="dk-orb dk-orb-2" />
  <div className="dk-orb dk-orb-3" />

  {/* Sparkle stars overlay */}
  <div className="dk-sparkles">
    {['✦', '✧', '⋆', '✦', '✧', '⋆', '✦', '✧', '⋆', '✦'].map((s, i) => (
      <span key={i} className="dk-spark">{s}</span>
    ))}
  </div>

  {/* All page content goes inside dk-wrap */}
  <div className="dk-wrap">
    {/* ...sections here... */}
  </div>
</div>
```

- `.dk` — full-page animated gradient, `min-height: 100vh`, `color: var(--dk-ink)`, `font-family: Nunito`
- `.dk-wrap` — centered content, `max-width: 1200px`, `padding: 110px 40px 80px`, `z-index: 1`
- Orbs and sparkles are decorative and fixed-position; they do not scroll with content.

---

## Layout Patterns

### Centered section label (before any grid/list section)
```tsx
<div className="dk-section-label">
  <span className="dk-section-title">Section Heading</span>
  <span className="dk-section-sub">Short supporting subtitle ✦</span>
</div>
```
- `.dk-section-title` — Pacifico 32px, `var(--dk-deep)`, block-level
- `.dk-section-sub` — Nunito 15px, `rgba(61,28,96,0.55)`

### Feature grid
```tsx
<div className="dk-features">
  {items.map(item => (
    <div
      className="dk-feature"
      style={{ background: item.bg, borderColor: item.border, color: item.color }}
    >
      <span className="dk-feature-emoji">{item.emoji}</span>
      <span className="dk-feature-tag">{item.tag}</span>
      <h2 className="dk-feature-title">{item.title}</h2>
      <p className="dk-feature-desc">{item.desc}</p>
    </div>
  ))}
</div>
```
- `.dk-features` — `grid`, `auto-fill minmax(300px, 1fr)`, `gap: 18px`
- `.dk-feature` — glassmorphism card: `border-radius: 24px`, `padding: 28px`, `backdrop-filter: blur(12px)`, 2px solid border, lift on hover
- Each card gets its own `bg` (light tint), `border` (medium tint), and `color` (accent color for pseudo-element) via inline styles
- `.dk-feature-emoji` — 36px icon
- `.dk-feature-tag` — 11px, uppercase, `letter-spacing: 0.1em`, pill shape, `rgba(255,255,255,0.7)` bg
- `.dk-feature-title` — Nunito 19px bold 800, `var(--dk-ink)`
- `.dk-feature-desc` — 14px, `rgba(61,28,96,0.62)`, line-height 1.68

### Two-column bottom cards
```tsx
<div className="dk-bottom">
  <div className="dk-bottom-card">
    <span>🌅</span>
    <h2 className="dk-bottom-title">Card Title</h2>
    <p className="dk-bottom-body">Card body text.</p>
  </div>
  <div className="dk-bottom-card dk-bottom-card-signs">
    {/* Centered card variant with lilac/sky gradient bg */}
  </div>
</div>
```
- `.dk-bottom` — `grid 1fr 1fr`, `gap: 18px`; collapses to 1-column below 860px
- `.dk-bottom-card` — glassmorphism: `rgba(255,255,255,0.6)`, `blur(16px)`, `border-radius: 28px`, `padding: 44px`, lilac border
- `.dk-bottom-card-signs` — variant with `linear-gradient(135deg, lilac 15%, sky 15%)`, centered flex layout
- `.dk-bottom-title` — Pacifico, `clamp(1.6rem, 3vw, 2.4rem)`, `var(--dk-deep)`
- `.dk-bottom-body` — Nunito 16px, `rgba(61,28,96,0.65)`, line-height 1.75

---

## Reusable Components

### Top badge / announcement bar
```tsx
<div className="dk-topbar">
  <div className="dk-badge">
    <span>✨</span>
    <span>Your message here</span>
    <span>✨</span>
  </div>
</div>
```
- Pill shape, glassmorphism, lilac border, `var(--dk-deep)` text, 13px 600 weight

### Moon / tag pills (horizontal row)
```tsx
<div className="dk-moon-row">
  {['🌑 Label', '🌕 Label'].map(m => (
    <div key={m} className="dk-moon-pill">{m}</div>
  ))}
</div>
```
- `.dk-moon-pill` — pill glassmorphism, `rgba(255,255,255,0.6)`, lilac border, 13px bold

### Notification banner
```tsx
<div className="dk-notif">
  <div className="dk-notif-text">
    <h3>🔔 Title</h3>
    <p>Subtitle text.</p>
  </div>
  <div className="dk-toggle" />
</div>
```
- Full-width banner, glassmorphism, flex space-between
- `.dk-toggle` — decorative toggle pill, lilac-to-rose gradient

### Primary button
```tsx
<a href="/" className="dk-btn-primary">✨ Call to Action</a>
```
- `linear-gradient(135deg, var(--dk-rose), var(--dk-lilac))`, white text, `border-radius: 999px`
- Hover: lifts `translateY(-3px) scale(1.03)`, deeper shadow
- Animated shimmer via `dk-btn-shimmer` keyframe

### Ghost button
```tsx
<a href="/" className="dk-btn-ghost">🌙 Secondary Action</a>
```
- `rgba(255,255,255,0.7)`, `var(--dk-deep)` text, lilac border, `border-radius: 999px`
- Hover: lifts, border becomes solid lilac

### Button group
```tsx
<div className="dk-btns">
  <a className="dk-btn-primary">Primary</a>
  <a className="dk-btn-ghost">Secondary</a>
</div>
```
- Flex row, `gap: 14px`, centered, wraps on small screens

### Zodiac sign grid
```tsx
<div className="dk-signs-grid">
  {signs.map(s => (
    <div key={s.sign} className="dk-sign-bubble">
      <span className="dk-sign-bubble-glyph">{s.sign}</span>
      <span className="dk-sign-bubble-name">{s.name.slice(0, 3)}</span>
    </div>
  ))}
</div>
```
- `.dk-signs-grid` — `grid repeat(4, 1fr)`, `gap: 8px`
- `.dk-sign-bubble` — small white pill, scales on hover

---

## Glassmorphism Recipe

Used consistently throughout. Apply these properties together:
```css
background: rgba(255, 255, 255, 0.6–0.7);
backdrop-filter: blur(10px–16px);
-webkit-backdrop-filter: blur(10px–16px);
border: 1.5px–2px solid rgba(200, 160, 232, 0.25–0.4);
box-shadow: 0 4px–8px 20px–40px rgba(200, 160, 232, 0.12–0.15);
border-radius: 16px–28px;
```

---

## Animations Reference

| Keyframe | Applied to | Behavior |
|----------|-----------|----------|
| `dk-gradient-shift` | `.dk` (page bg) | Slow 12s gradient pan |
| `dk-float` | `.dk-orb` | 8s gentle vertical bob |
| `dk-sparkle` | `.dk-spark` | Fade + rotate stars, 2.6–3.5s |
| `dk-text-shift` | `.dk-headline-accent` | 5s gradient text pan |
| `dk-btn-shimmer` | `.dk-btn-primary` | Continuous shimmer on button |

---

## Responsive Breakpoint

At `max-width: 860px`:
- `.dk-wrap` padding reduces to `100px 20px 60px`
- `.dk-bottom` collapses from 2 columns → 1 column
- `.dk-moon-row` wraps
- `.dk-hero` gets `padding: 0 10px`

---

## Typography Scale

| Class | Font | Size | Weight | Color |
|-------|------|------|--------|-------|
| `.dk-headline` | Pacifico | `clamp(2.8rem, 7vw, 6rem)` | — | `var(--dk-deep)` |
| `.dk-headline-accent` | Pacifico | inherited | — | Gradient text (rose→lilac→sky) |
| `.dk-section-title` | Pacifico | 32px | — | `var(--dk-deep)` |
| `.dk-bottom-title` | Pacifico | `clamp(1.6rem, 3vw, 2.4rem)` | — | `var(--dk-deep)` |
| `.dk-body` | Nunito | 18px | 400 | `rgba(61,28,96,0.72)` |
| `.dk-section-sub` | Nunito | 15px | — | `rgba(61,28,96,0.55)` |
| `.dk-bottom-body` | Nunito | 16px | — | `rgba(61,28,96,0.65)` |
| `.dk-feature-title` | Nunito | 19px | 800 | `var(--dk-ink)` |
| `.dk-feature-desc` | Nunito | 14px | — | `rgba(61,28,96,0.62)` |
| `.dk-feature-tag` | Nunito | 11px | 800 | `var(--dk-deep)` |
| `.dk-badge` text | Nunito | 13px | 600 | `var(--dk-deep)` |

---

## Dos and Don'ts

**Do:**
- Always wrap page content in `.dk > .dk-wrap`
- Always include the 3 orbs and sparkles layer at the top of `.dk`
- Use Pacifico for display headings, Nunito for everything else
- Apply glassmorphism to all card/pill surfaces
- Use emojis as decorative icons inline with text or as section anchors
- Use `border-radius: 999px` for pills, `16px–28px` for cards
- Use inline styles for per-card color theming (bg, border, color)

**Don't:**
- Don't use plain white or solid-color backgrounds — always use `rgba` with `backdrop-filter`
- Don't use colors outside the palette without strong reason
- Don't skip the `z-index: 1` on `.dk-wrap` (orbs are `z-index: 0`)
- Don't use `font-family` directly other than Pacifico and Nunito
- Don't add hard pixel font sizes for headings — use `clamp()` for responsive display type
