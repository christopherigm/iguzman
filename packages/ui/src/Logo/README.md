# Logo Component Documentation

## Purpose

The Logo component renders a logo image with customizable properties. It supports dynamic logo sources from environment variables and can be configured for different screen sizes and display behaviors.

## Props

- `src` (string, optional): The source URL for the logo image
- `width` (number, optional): Width of the logo (default: 100)
- `fullWidth` (boolean, optional): Whether the logo should take full width (default: false)
- `showAlways` (boolean, optional): Whether to show the logo always regardless of screen size (default: false)
- All other props are passed to the underlying Box component

## Usage

```tsx
import { Logo } from '@iguzman/ui/Logo';

function Example() {
  return <Logo src="/logo.svg" width={150} />;
}
```

## Implementation Details

The component:

1. Gets base URLs from environment variables using helper functions
2. Determines the logo source from props, NEXT_PUBLIC_LOGO, or LOGO environment variables
3. Returns null if no logo source is provided
4. Replaces K8s base URL with API base URL in the logo source
5. Uses a Link component to make the logo clickable
6. Applies responsive styling using MUI's sx prop
7. Uses Box component for styling and layout
