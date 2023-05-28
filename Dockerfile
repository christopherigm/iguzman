FROM node:18-alpine

# ARG REACT_APP_API_URL
# ARG REACT_APP_BRANCH_NAME
# ARG REACT_APP_FACEBOOK_APP_ID
# ARG REACT_APP_PRODUCTION

WORKDIR /app

# Copy root package.json and lockfile
# COPY turbo.json ./
# COPY package.json ./
# COPY package-lock.json ./
# COPY apps/resume-web/package.json ./apps/resume-web/package.json
# RUN npm install


RUN npm i next react-redux redux-persist @reduxjs/toolkit sharp
# RUN npm i next
COPY apps/resume-web ./


EXPOSE 3000
CMD [ "npm", "run", "start" ]
