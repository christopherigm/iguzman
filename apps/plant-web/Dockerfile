FROM node:18-alpine

WORKDIR /app
COPY . .

RUN ls -a

RUN npm i --production

CMD [ "npm", "run", "start" ]
