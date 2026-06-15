---
name: feedback-props-over-css
description: Always express static styles as component props on @repo/ui components, never in CSS classes
metadata:
  type: feedback
---

When styling `@repo/ui` components (`Box`, `Typography`, `Button`, `Container`, etc.), always use UIComponentProps first - never write a CSS class that only contains left-column properties (layout, spacing, sizing, borders, colors).

**Why:** The project already has a "component-props-first rule" in `packages/ui/CLAUDE.md`. The user had to explicitly request a CSS→props conversion after a feature was built with unnecessary CSS classes. The rule must be followed proactively, not corrected retroactively.

**How to apply:** Before writing any `.css` rule for a `@repo/ui` component, check if every property in that rule can be expressed as a prop. If yes, use props only. A CSS class on a `@repo/ui` component must contain **only** pseudo-selectors (`:hover`, `:focus`), transitions/animations, `@media` queries, or pseudo-elements - nothing else. Use the `styles` escape-hatch prop for CSS properties not covered by UIComponentProps (e.g. `fontSize`, `gridTemplateColumns`, `letterSpacing`).
