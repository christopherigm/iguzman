import axios from 'axios';
import fs from 'fs';
import https from 'node:https';
import type { IncomingMessage } from 'node:http';
const jsdom = require('jsdom');
const { JSDOM } = jsdom;

const getImage = (search: string, id: string): Promise<string> => {
  return new Promise((res, rej) => {
    let img = '';
    axios
      .get(`https://www.google.com/search?q=${search}&tbm=isch`)
      .then((response: any) => {
        const dom = new JSDOM(response.data);
        [...dom.window.document.querySelectorAll('img')]
          .splice(0, 2)
          .forEach((el) => {
            if (String(el.src.toString()).includes('http')) {
              img = el.src.toString();
              return;
            }
          });
        https.get(img, (message: IncomingMessage) => {
          const path = `media/${id}.jpeg`;
          const filePath = fs.createWriteStream(path);
          message.pipe(filePath);
          filePath.on('finish', () => {
            filePath.close();
            res(path);
          });
        });
      })
      .catch((error: any) => console.log(error));
  });
};

export default getImage;
