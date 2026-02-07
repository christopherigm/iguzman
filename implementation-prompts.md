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

- NextJS (App Router)
- React
- Typescript
- MUI Framework

Add the Button inside of UI package "@iguzman/ui" to the UI of "Hello World" app

---

Add a comprehensive readme.md file to Turbo monorepo /home/christopher/Documents/iguzman considering its content

---

### Migration

Read packages/helpers/src/build-and-deploy.js file, analyze it and improve it following the next requirements:

- Improve the code
- Improve readability
- Fix any possible bug
- Add inline documentation
- Improve typing

- Add unit tests
- Add a readme.md file
- Add a llm.txt file

### API Library prompt

I want to create a typescript file that handles HTTP requests (GET, POST, etc.) using promises for each method. It should support JSONAPI specification and implement the function "rebuildJsonApiResponse" in packages/helpers/src/json-api-rebuild/json-api-rebuild.ts file for HTTP methods that return data when jsonapi parameter is true.

Each HTTP Method function should recieve the appropriate parameters in adition to the following mandatory parameters:

- BaseURL: string (default to process.env.BASE_URL)
- URL: string
- JWT Access token: string
- jsonapi: boolean (default to false)

I want you to implement proper typing for paramaters and responses. Implement proper error handling too and add inline documentation. Add a readme.md file for its usage.
