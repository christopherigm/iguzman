# Create a new React Component

### ComponentName

Component name "<ComponentName>" is given by the user

### Work directory

Work Directory should follow the path: packages/ui/src/<ComponentName>/

## Tech stack

- React
- Typescript
- Material-UI (MUI)
- mui icons-material

## Instrucctions and requirements

- Follow React best practices (https://vercel.com/blog/introducing-react-best-practices)
- Follow clean code design pattern
- Refactor functions if needed
- Extract constants and types outide functions
- Improve readability
- Fix broken dependencies
- Fix any possible bug
- Add inline JSDoc documentation and @example
- Improve typing
- Remove unnecesary code
- Rename the file and/or functions with better names if needed
- Add checks for possible undefined values
- When importing modules don't use relative paths, use monorepo syntaxt instead, example: "@iguzman/<package>/<module>"
- Use packages/helpers/src/http-client for http calls
- Use packages/helpers/src/types for common types
- Use packages/helpers/src/constants for common constants
- Always use functional React components with arrow functions
- Add "export default <ComponentName>" at the end of the file

### References

- Use "packages/ui/src/Code/Code.tsx" file as reference for code style and best practices
- Use "packages/ui/src/Dialog/Dialog.stories.tsx" file as reference for Storybook

## Files to Create

### Storybook File

Create a Storybook file for the new component <ComponentName>, use "packages/ui/src/Dialog/Dialog.stories.tsx" file as reference.

### LLM Text File

Create a llm txt file for the component in Work Directory, the content of the llm text file should:

- follow the next naming convention: <ComponentName>.llm.txt
- include title, e.g. # <ComponentName> Component Documentation
- include purpose, e.g. ## Purpose
- include props, e.g. ## Props
- include usage, e.g. ## Usage ```tsx ...
- include implementation details, e.g. ## Implementation Details

### Readme.md File

Create a readme file called "README.MD" in Work Directory, the content of the md file should:

- include title, e.g. # <ComponentName> Component Documentation
- include purpose, e.g. ## Purpose
- include props, e.g. ## Props
- include usage, e.g. ## Usage: ```tsx ...
- include implementation details, e.g. ## Implementation Details

### index.ts File

Create an index.ts file in Work Directory to export the default component, e.g. export { default } from './<ComponentName>';
