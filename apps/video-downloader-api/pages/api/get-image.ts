import type { NextApiRequest, NextApiResponse } from 'next';
import NextCors from '@/lib/cors';
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
const axios = require('axios');
import { exec } from 'child_process';
import os from 'node:os';
import { winBinary, linuxBinary } from '@/config';
import { getOrCreateItem, updateItem } from '@/lib/item';
import type Item from '@/types/items';
const fs = require('fs');
// const https = require('https');
import https from 'node:https';
import type { IncomingMessage } from 'node:http';

const onData = (data: any) => {
  console.log('>>>', data);
};

export const getImage = (search: string, id: string): Promise<string> => {
  return new Promise((res, rej) => {
    // fetch('https://www.google.com/search?q=tiger&tbm=isch')
    let img = '';
    axios
      .get(`https://www.google.com/search?q=${search}&tbm=isch`)
      .then((response: any) => {
        // console.log('data', data.body);
        const dom = new JSDOM(response.data);
        // console.log('dom', dom.window.document);
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
            res(img);
          });
        });
      })
      .catch((error: any) => console.log(error));
  });
};

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<string>
) {
  NextCors(req, res)
    .then(() => {
      getImage('ven a mi (radio version)', 'id')
        .then((data) => res.status(200).send(data))
        .catch((error) => res.status(400).send(error.toString()));
    })
    .catch((error) => res.status(400).send(error.toString()));
}
