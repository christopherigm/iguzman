# Button Component Documentation

## Purpose

The Button component is a wrapper around Material-UI's Button component that provides a consistent button implementation across the application. It allows for easy customization and extension of button functionality while maintaining Material-UI's design system.

## Props

The Button component accepts all props that are available in Material-UI's Button component. These include:

- `children`: The content of the button
- `variant`: The variant to use (text, outlined, contained)
- `color`: The color of the button (primary, secondary, etc.)
- `size`: The size of the button (small, medium, large)
- `disabled`: If true, the button will be disabled
- `onClick`: Callback function for when the button is clicked
- `href`: If set, the button will render as an anchor tag
- `type`: The type of the button (button, submit, reset)
- `className`: CSS class name for custom styling
- `sx`: Style overrides for the component

## Usage

```tsx
import { Button } from '@mui/material';

// Basic usage
<Button variant="contained" color="primary">
  Click me
</Button>

// With onClick handler
<Button variant="outlined" onClick={() => console.log('Clicked')}>
  Handle Click
</Button>

// Disabled button
<Button variant="contained" disabled>
  Disabled
</Button>
```

## Implementation Details

The Button component is implemented as a simple wrapper around Material-UI's Button component. It re-exports all props from MuiButton to maintain compatibility and allows for easy extension. The component is designed to be lightweight and maintain the Material-UI design system while providing a consistent interface for button usage throughout the application.
