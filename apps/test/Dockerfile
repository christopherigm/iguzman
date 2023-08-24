FROM node:18-alpine

WORKDIR /app
ENV NODE_ENV production
COPY . .

RUN npm i --production

CMD [ "npm", "run", "start" ]
