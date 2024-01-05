FROM nikolaik/python-nodejs:python3.12-nodejs20-alpine

WORKDIR /app
ENV NODE_ENV production
COPY . .

RUN npm i --production
RUN chmod +x yt-dlp
RUN chmod +x ffmpeg
RUN mv ffmpeg /usr/bin
RUN node convert-cookies.js cookies.txt > netscape-cookies.txt

CMD [ "node", "--env-file=.env", "dist/app.js" ]
