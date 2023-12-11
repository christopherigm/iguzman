FROM node:16-alpine

ARG REACT_APP_API_URL
ARG REACT_APP_BRANCH_NAME
ARG REACT_APP_FACEBOOK_APP_ID
ARG REACT_APP_PRODUCTION

WORKDIR /app
COPY . .

RUN npm i
RUN npm run build
RUN rm -rf node_modules
RUN npm i --production
RUN ls
RUN /bin/sh server/prepare-index.sh

CMD [ "/bin/sh", "docker-entrypoint.sh" ]
