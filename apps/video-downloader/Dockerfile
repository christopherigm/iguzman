FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV production
COPY .next .next
COPY .env .
COPY package.prod.json package.json

RUN npm i

CMD [ "npm", "run", "start" ]
