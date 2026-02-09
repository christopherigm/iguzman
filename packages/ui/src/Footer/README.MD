# Footer Component Documentation

## Purpose

A full-width, responsive footer component that provides standard website navigation, branding, social links, a language toggle (EN/ES), and a theme-mode toggle (light/dark). Built with Material-UI and designed to collapse gracefully on mobile devices.

## Props

| Prop               | Type                           | Default      | Description                                      |
|--------------------|--------------------------------|--------------|--------------------------------------------------|
| `language`         | `'en' \| 'es'`                 | `'en'`       | Active language code                             |
| `brandName`        | `string`                       | `'iguzman'`  | Brand / company name displayed in the footer     |
| `tagline`          | `string`                       | Auto (i18n)  | Short tagline below the brand name               |
| `github`           | `string`                       | —            | GitHub profile URL                               |
| `linkedin`         | `string`                       | —            | LinkedIn profile URL                             |
| `twitter`          | `string`                       | —            | X (Twitter) profile URL                          |
| `email`            | `string`                       | —            | Contact email address                            |
| `sections`         | `FooterSection[]`              | Auto (i18n)  | Override default navigation columns              |
| `onLanguageChange` | `(language: Language) => void` | —            | Callback fired when the user changes the language|
| `bgColor`          | `string`                       | —            | Background colour override (CSS value)           |

### FooterSection

```ts
interface FooterSection {
  title: string;
  links: { label: string; href: string }[];
}
```

## Usage

```tsx
import Footer from '@iguzman/ui/Footer';

function App() {
  return (
    <Footer
      language="en"
      brandName="My App"
      github="https://github.com/my-app"
      linkedin="https://linkedin.com/company/my-app"
      email="hello@myapp.com"
      onLanguageChange={(lang) => console.log(lang)}
    />
  );
}
```

### Custom sections

```tsx
<Footer
  sections={[
    {
      title: 'Platform',
      links: [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Analytics', href: '/analytics' },
      ],
    },
  ]}
/>
```

## Implementation Details

- **i18n**: All default labels are provided in English and Spanish via an internal `LABELS` map. The language toggle switches the footer text in real time.
- **Responsive grid**: Uses MUI `Grid` with breakpoint-aware `size` props — single column on `xs`, two columns on `sm`, multi-column on `md+`.
- **ThemeModeToggle**: Integrates the `ThemeModeToggle` component in mini mode for compact light/dark switching.
- **Social links**: Conditionally rendered icon buttons (GitHub, LinkedIn, X, Email) with hover animations.
- **Customisable sections**: Pass a `sections` prop to fully replace the default navigation columns.
- **Accessible**: All social buttons include `aria-label` attributes and external links use `rel="noopener noreferrer"`.
