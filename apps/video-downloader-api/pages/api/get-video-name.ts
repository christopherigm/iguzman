import type { NextApiRequest, NextApiResponse } from 'next';
import NextCors from '@/lib/cors';
import { exec } from 'child_process';
import os from 'node:os';
import { winBinary, linuxBinary } from '@/config';
import { getOrCreateItem, updateItem } from '@/lib/item';
import type Item from '@/types/items';

const onData = (data: any) => {
  console.log('>>>', data);
};

export const getVideoName = (
  url: string,
  justAudio: boolean = false,
  force: boolean = false
): Promise<Item> => {
  return new Promise((res, rej) => {
    getOrCreateItem({ url, justAudio })
      .then((i: Item) => {
        const item = { ...i };
        // console.log('>', item);
        if (item.name && !force) {
          return res(item);
        }
        const dataToPrint =
          '%(title)s:-:%(artist)s:-:%(album)s:-:%(album_artist)s';
        let command =
          os.platform() === 'win32'
            ? `${winBinary} "${url}" --print "${dataToPrint}"`
            : `${linuxBinary} "${url}" --print "${dataToPrint}"`;
        if (os.platform() !== 'win32') {
          command += ' --cookies /app/netscape-cookies.txt';
        }
        exec(command, (err, videoName: string) => {
          if (err) {
            console.log('Error, getVideoName:', err);
            return rej(err);
          }
          let metadata = videoName
            .replace(/\n/g, '')
            .replace(/https\:\/\//g, '')
            .replace(/fyp/g, '')
            .replace(/\//g, '')
            .replace(/\./g, '')
            .replace(/\@/g, '')
            .replace(/\#/g, '')
            .replace(/\?/g, '')
            .replace(/\"/g, '')
            .replace(/\u2013|\u2014/g, '-')
            .replaceAll('(Lyrics)', '')
            .replaceAll('(lyrics)', '')
            .replaceAll('(Audio)', '')
            .replaceAll('(audio)', '')
            .replaceAll('(Official Audio)', '')
            .replaceAll('(Official audio)', '')
            .replaceAll('(Official Video)', '')
            .replaceAll('(official video)', '')
            .replaceAll('[Official Audio]', '')
            .replaceAll('[Official audio]', '')
            .replaceAll('[Official Video]', '')
            .replaceAll('[official video]', '')
            .replaceAll('(Radio Version)', '')
            .replaceAll('(Official HD Video)', '')
            .replaceAll('(official hd video)', '')
            .replaceAll('(hd video)', '')
            .replaceAll('(Video)', '')
            .replaceAll('(video)', '')
            .replace(/(?:https?|ftp):\/\/[\n\S]+/g, '');
          let [name, artist, album, albumArtist] = metadata.split(':-:');
          name = name.replace(/  /g, ' ');
          if (name.length > 128) {
            name = name.slice(0, 128);
          }
          if (name[name.length - 1] === ' ') {
            name = name.slice(0, name.length - 1);
          }
          item.name = name;
          if (album) {
            item.album = album;
          }
          if (artist || albumArtist) {
            item.artist = artist;
            item.albumArtist = albumArtist === 'NA' ? artist : albumArtist;
          }
          updateItem(item).finally(() => res(item));
        }).stdout?.on('data', onData);
      })
      .catch((error) => console.log(error));
  });
};

export default function handler(
  req: NextApiRequest,
  res: NextApiResponse<Item | string>
) {
  NextCors(req, res)
    .then(() => {
      const url = req.body?.data?.url ?? null;
      if (!url) {
        return res.status(400).json({
          id: '',
          status: 'error',
          url: '',
          error: 'No url provided',
        });
      }
      const justAudio = req.body?.data?.justAudio ?? false;
      getVideoName(url, justAudio)
        .then((item: Item) => res.status(200).json(item))
        .catch((error) => res.status(400).send(error.toString()));
    })
    .catch((error) => res.status(400).send(error.toString()));
}