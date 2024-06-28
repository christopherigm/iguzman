import type { NextApiRequest, NextApiResponse } from 'next';
import NextCors from '@/lib/cors';
import { exec } from 'child_process';
import os from 'node:os';
import { winBinary, linuxBinary } from '@/config';
import { getOrCreateItem, updateItem } from '@/lib/item';
import type Item from '@/types/items';
import { isX, isYoutube } from '@repo/utils';

const onData = (data: any) => {
  console.log('>>>', data);
};

export const getVideoName = (
  url: string,
  justAudio: boolean = false,
  hdTikTok: boolean = true,
  force: boolean = false
): Promise<Item> => {
  return new Promise((res, rej) => {
    let URL = url;
    if (isX(url)) {
      URL = URL.replaceAll('x.com', 'twitter.com');
    }
    if (URL.search('si=')) {
      URL = URL.split('si=')[0];
    }
    getOrCreateItem({ url: URL, justAudio, hdTikTok })
      .then((i: Item) => {
        const item = { ...i };
        console.log('>>> getOrCreateItem -> Item:', item);
        if (item.name && !force) {
          return res(item);
        }
        const dataToPrint =
          isYoutube(url) && justAudio
            ? '%(title)s:-:%(artist)s:-:%(album)s:-:%(album_artist)s'
            : '%(title)s';
        let command =
          os.platform() === 'win32'
            ? `${winBinary} "${URL}" --print "${dataToPrint}"`
            : `${linuxBinary} "${URL}" --print "${dataToPrint}"`;
        if (os.platform() !== 'win32') {
          command += ' --cookies /app/netscape-cookies.txt';
        }
        if (isYoutube(URL)) {
          command += ' --no-playlist ';
        }
        exec(command, (err, videoName: string) => {
          if (err) {
            console.log('Error, getVideoName:', err);
            videoName = url;
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
          // https://youtu.be/5GzzUPUAxeQ?si=0Zp2TWJ3-O9tnR1w
          item.name = name;
          if (album) {
            item.album = album;
          }
          if (artist || albumArtist) {
            item.artist = artist;
            item.albumArtist = albumArtist === 'NA' ? artist : albumArtist;
          }
          console.log('>>> getOrCreateItem -> Item (final):', item);
          updateItem(item)
            .catch((error) => rej(error))
            .finally(() => res(item));
        }).stdout?.on('data', onData);
      })
      .catch((error) => rej(error.toString()));
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
      const hdTikTok =
        req.body?.data?.hdTikTok !== undefined ? req.body.data.hdTikTok : true;
      getVideoName(url, justAudio, hdTikTok)
        .then((item: Item) => res.status(200).json(item))
        .catch((error) => res.status(400).send(error.toString()));
    })
    .catch((error) => res.status(400).send(error.toString()));
}
