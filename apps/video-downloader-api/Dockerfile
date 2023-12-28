FROM nikolaik/python-nodejs:python3.12-nodejs20-alpine

WORKDIR /app
ENV NODE_ENV production
COPY . .
COPY package.prod.json package.json
RUN chmod +x yt-dlp
RUN chmod +x ffmpeg
RUN mv ffmpeg /usr/bin
RUN node convert-cookies.js cookies.txt > netscape-cookies.txt

RUN npm i

CMD [ "npm", "run", "start" ]
