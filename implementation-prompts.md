### Create Monorepo

I want to create a Turbo monorepo inside /home/christopher/Documents/iguzman folder

---

Add author information:

- Name: Christopher Guzman
- License: Copyright
- Email: chris@iguzman.com.mx

---

Enable typescript and jest in the monorepo

---

Add the following NPM libraries to the monorepo (using the latest version):

- React
- NextJS
- Material-UI (MUI)
- mui icons-material
- OllamaJS
- copy-to-clipboard
- jose (jwt)
- mongodb
- redis
- swiper
- zod
- react-qrcode-logo
- next-plausible

---

Create a new Turbo react package to contain reusable components called "ui" inside of /home/christopher/Documents/iguzman/packages folder

---

Create a new Turbo package to contain ts files (libraries, functions, helpers) called "helpers" inside of /home/christopher/Documents/iguzman/packages folder

---

Create a "Hello World" NextJS app inside /home/christopher/Documents/iguzman/apps folder called "hello-world-app" with the following requirements:

- NextJS
- React
- Typescript
- MUI Framework

Add the Button inside of UI package "@iguzman/ui" to the UI of "Hello World" app

---

Add a comprehensive readme.md file to Turbo monorepo /home/christopher/Documents/iguzman considering its content

---

Read packages/helpers/src/types folder analyze the files in the folder and merge them in a single file, improve it following the next requirements:

- Improve the code
- Improve readability
- Fix any possible bug
- Add inline documentation
- Improve typing
- Remove unnecesary code

### Migration

Read packages/helpers/src/server-get-base-url.ts file, analyze it and improve it following the next requirements:

- Follow clean code design pattern
- Improve the code
- Refactor functions if needed
- Extract constants and types outide functions
- Improve readability
- Fix any possible bug
- Add inline JSDoc documentation and @example
- Improve typing
- Remove unnecesary code
- Rename the file and/or functions with better names if needed
- Add checks for possible undefined values

Use "video-upscale-fps.ts" file as reference for code style and best practices

- Add unit tests with Jest
- When importing modules don't use relative paths, use monorepo syntaxt instead, example: "@iguzman/<package>/<module>"
- Use packages/helpers/src/http-client for http calls
- Use packages/helpers/src/types for common types
- use packages/helpers/src/constants for common constants

Use the following modules if needed:

- packages/helpers/src/types.ts
- packages/helpers/src/constants.ts
- packages/helpers/src/http-client.ts

- packages/helpers/src/download-video.ts
- packages/helpers/src/duplicate-video-time-length.ts
- packages/helpers/src/delete-media-file.ts
- packages/helpers/src/copy-file.ts
- packages/helpers/src/video-upscale-fps.ts
- packages/helpers/src/add-audio-to-video-in-time.ts
- packages/helpers/src/extract-audio-from-video.ts
- packages/helpers/src/duplicate-audio-time-length.ts

- packages/helpers/src/duplicate-audio-time-length.ts
- packages/helpers/src/delete-media-file.ts
- packages/helpers/src/extract-audio-from-video.ts

- packages/helpers/src/get-env-variables.ts
- packages/helpers/src/local-storage.ts

Fill the missing dependencies using the following local modules:

- packages/helpers/src/server-get-host.ts
- packages/helpers/src/copy-file.ts
- packages/helpers/src/delete-media-file.ts

### API Library prompt

I want to create a typescript file that handles HTTP requests (GET, POST, etc.) using promises for each method. It should support JSONAPI specification

Each HTTP Method function should recieve the appropriate parameters in adition to the following mandatory parameters:

- BaseURL: string (default to process.env.BASE_URL)
- URL: string
- JWT Access token: string
- jsonapi: boolean (default to false)

I want you to implement proper typing for paramaters and responses. Implement proper error handling too and add inline documentation. Add a readme.md file for its usage.

### UI Package Migration

## Instrucctions and requirements

Read and analyze the code and improve it following the next requirements:

- Follow React best practices (https://vercel.com/blog/introducing-react-best-practices)
- Follow clean code design pattern
- Improve the code
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
- Use llm-skills files

## Work Directory

Work Directory should follow the path: @iguzman/<package>/<module>/<ComponentName>

## References

Use "Code.tsx" file as reference for code style and best practices

Create a Storybook file for the new component, use "Code.stories.tsx" file as reference

## LLM Text File

Add a llm txt file for the component and save it in the same directory, the name of the llm text file should:

- match the component's name
- follow the next naming convention: <ComponentName>.llm.txt
- include title, e.g. # <ComponentName> Component Documentation
- include purpose, e.g. ## Purpose
- include props, e.g. ## Props
- include usage, e.g. ## Usage ```tsx ...
- include implementation details, e.g. ## Implementation Details

## Readme.md File

Add a README.MD file for the component and save it in the same directory, the name of the md file should:

- include title, e.g. # <ComponentName> Component Documentation
- include purpose, e.g. ## Purpose
- include props, e.g. ## Props
- include usage, e.g. ## Usage: ```tsx ...
- include implementation details, e.g. ## Implementation Details

## index.ts File

Add an index.ts file in Work Directory to export the new component
