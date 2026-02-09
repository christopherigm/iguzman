# ThemeModeToggle Component Documentation

## Purpose

The ThemeModeToggle component provides a user interface for switching between light, dark, and system color modes. It offers both mini icon buttons and full button group variations for different use cases.

## Props

- `mini` (boolean, optional): Whether to display mini icons instead of full buttons. Default is `false`.
- `fullWidth` (boolean, optional): Whether to make the button group full width. Default is `true`.
- `language` (Language, optional): Language for button labels. Default is `'en'`.

## Usage

```tsx
<ThemeModeToggle language="es" mini={true} />
```

## Implementation Details

The component uses MUI's `useColorScheme` hook to manage theme mode. It handles system mode by defaulting to light mode. The component supports both mini icon buttons and full button groups. For mini mode, it uses IconButton components with LightModeIcon and DarkModeIcon. For full mode, it uses ButtonGroup with individual Button components for light and dark modes. The component memoizes values to prevent unnecessary re-renders and includes proper accessibility attributes.
