# NavItem Component Documentation

## Purpose

The NavItem component is a flexible navigation item that can handle different types of navigation including links, callbacks, and submenu items. It's designed to be used within a navigation bar or menu system.

## Props

- `children` (ReactNode) - The text content of the navigation item
- `href` (string, optional) - The URL to navigate to
- `callback` (function, optional) - Callback function to execute when clicked
- `icon` (ReactNode, optional) - Icon component to display
- `selected` (boolean, optional) - Whether the item is currently selected
- `subMenus` (Array<NavItemProps>, optional) - Array of submenu items
- `primaryColor` (string, optional) - Primary color for styling
- `darkNavBar` (boolean, optional) - Whether the navigation bar is in dark mode

## Usage

```tsx
<NavItem href="/home" icon={<HomeIcon />}>
  Home
</NavItem>

<NavItem callback={() => console.log('Clicked')}>
  Click Me
</NavItem>

<NavItem subMenus={[
  { children: 'Sub Item 1', href: '/sub1' },
  { children: 'Sub Item 2', callback: () => console.log('Sub 2 clicked') }
]}>
  Menu
</NavItem>
```

## Implementation Details

The component handles three main navigation types:

1. Regular links with href prop
2. Callback functions with callback prop
3. Submenus with subMenus prop

The component uses responsive design principles with different layouts for different screen sizes. It also handles drawer state management (though this is mocked in the current implementation and should be provided by the parent component).

The component includes proper TypeScript typing and follows React best practices with functional components and hooks.
