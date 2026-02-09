# ScrollToBottom Component Documentation

## Purpose

The ScrollToBottom component automatically scrolls to the bottom of the page when mounted or updated. It's useful for chat applications, logs, or any component where you want to keep the latest content in view.

## Props

- `scrollToBottomOnMount` (boolean, optional): Whether to scroll to bottom when component mounts. Default is `true`.
- `scrollToBottomOnUpdate` (boolean, optional): Whether to scroll to bottom when component updates. Default is `false`.
- `scrollBehavior` ('auto' | 'smooth', optional): Scroll behavior when scrolling to bottom. Default is `'smooth'`.

## Usage

```tsx
import { ScrollToBottom } from '@iguzman/ui/scroll-to-bottom';

function MyComponent() {
  return (
    <div>
      <ScrollToBottom />
    </div>
  );
}
```

## Implementation Details

The component uses React's useEffect hooks to trigger scrolling on mount and update. It uses window.scrollTo() with fallback handling for browsers that don't support smooth scrolling. The component is wrapped in a div element that serves as a reference point for potential future enhancements.
