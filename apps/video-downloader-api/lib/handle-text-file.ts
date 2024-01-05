import fs from 'fs';
import { exec } from 'child_process';
import { v4 as uuidv4 } from 'uuid';

const onData = (data: any) => {
  console.log('>>>', data);
};

export const saveEntity = (url: string): Promise<string> => {
  return new Promise((res, rej) => {
    const id = uuidv4();
    const status = 'none';
    if (!fs.existsSync(`${id}.mp4`)) {
      return rej(new Error('File does not exist.'));
    }
    exec(`"touch ${id}.txt"`, (err, stdout) => {
      if (err) {
        return rej(err);
      }
      res(stdout);
    }).stdout?.on('data', onData);
  });
};

export const moveVideo = (
  videoName: string,
  id: string,
  ext: string
): Promise<string> => {
  return new Promise((res, rej) => {
    if (!fs.existsSync(`${id}.mp4`)) {
      return rej(new Error('File does not exist.'));
    }
    exec(`mv ${id}.${ext} "media/${id}.${ext}"`, (err, stdout) => {
      if (err) {
        return rej(err);
      }
      res(stdout);
    }).stdout?.on('data', onData);
  });
};
