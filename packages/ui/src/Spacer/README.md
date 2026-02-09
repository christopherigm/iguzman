# Spacer Component Documentation

## Purpose

The Spacer component is a reusable UI element that creates vertical spacing between other components. It uses MUI's Box component to render a vertical space with a specified height, making it easy to maintain consistent spacing throughout the application.

## Props

- `height` (number, optional): The height of the spacer in pixels. Defaults to 15.
- All other props are passed through to the underlying MUI Box component.

## Usage

```tsx
import { Spacer } from '@iguzman/ui/Spacer';

function Example() {
  return (
    <>
      <p>First content</p>
      <Spacer height={20} />
      <p>Second content</p>
    </>
  );
}
```

## Implementation Details

The component is implemented as a functional component that accepts a height prop and passes all other props to a MUI Box component. It validates that the height is a positive number, defaulting to 0 if invalid. The component is exported as a default export.
