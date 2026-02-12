I want to create a nextjs template project as scaffold or blueprint to create other projects.

### Work directory

Work Directory should follow the path: apps<nextjs-base-project>

## General project structure

- <nextjs-base-project>
  - app # App Router folder
    - home-page (page.tsx)
    - terms-and-conditions
      - page.tsx
    - contact
      - page.tsx
    - about
      - page.tsx
    - privacy
      - page.tsx
    - access
      - page.tsx # sign in and sign out functionality
    - layout.tsx # server component
    - not-found.tsx
  - components # Reusable customizable components
    - footer
      - Company logo (from public folder)
      - Theme toogle
      - Social network icons
      - Other relevant information
    - navbar
      - Company logo (from public folder)
      - Search box functionality
      - User profile
      - Theme toogle
    - drawer
    - modal
  - utils
  - public

## Tech stack

- NextJS (App router) (Latest version compatible with monorepo)
- Typescript
- Material-UI (MUI) (Latest version compatible with monorepo)
- mui icons-material (Latest version compatible with monorepo)

## Instrucctions and requirements

- Follow React best practices (https://vercel.com/blog/introducing-react-best-practices)
- Use server components as much as possible
- Implement light and dark theme support with MUI framework
  - Use cookies to avoid ssr flickering
  - Add a theme toggle in:
    - Footer
    - Navbar
    - Drawer
- Implement useContext and reducer in layout.tsx to handle the state
- If children components need access to the state, they should use the useContext
  react hook
- If a portion of the server component needs client interaction, extract
  functionality into a separated client component inside "components" folder
- Keep files size under 200 lines of code
- Create multiple files / components
- Each file / component should handle a single responsability
- Follow clean code design pattern
- Add inline JSDoc documentation and @example
- Implement pure functions pattern
- Use packages/helpers/src/http-client for http calls
- Use packages/helpers/src/types for common types
- Use packages/helpers/src/constants for common constants
- Always use functional React components with arrow functions
- Add checks for possible undefined values
- i18n support
- Sign in
  - Email and password
  - Google
- Sign up
  - Email and password
  - Google
