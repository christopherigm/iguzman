import type { NextApiRequest, NextApiResponse } from 'next';
import NextCors from '@/lib/cors';
import { exec } from 'child_process';
import os from 'node:os';
import fs from 'fs';
import {
  winBinary,
  linuxBinary,
  ffmpegWinBinary,
  ffmpegLinuxBinary,
} from '@/config';
import { getOrCreateItem, updateItem } from '@/lib/item';
import { getVideoName } from '@/pages/api/get-video-name';
import type Item from '@/types/items';
import type DownloadOptions from '@/types/download-options';
import type Metadata from '@/types/metadata';
import { isYoutube, isInstagram, isTiktok } from '@repo/utils';
import requestIp from 'request-ip';

const onData = (data: any) => {
  console.log('>>>', data);
};

export const writeMetadataToFile = (
  item: Item,
  force: boolean = false
): Promise<Item> => {
  return new Promise((res, rej) => {
    if (
      !item.id ||
      !item.extention ||
      !fs.existsSync(`media/${item.id}.${item.extention}`)
    ) {
      console.log('No tiem', item);
      return rej('No item');
    }
    if (fs.existsSync(`media/${item.filename}`) && !force) {
      item.status = 'ready';
      return updateItem(item).finally(() => res(item));
    }
    if (item.justAudio) {
      item.filename = `${item.name}.${item.extention}`;
      if (
        (item.artist === 'NA' ||
          item.artist === undefined ||
          item.artist === 'undefined' ||
          force) &&
        item.name &&
        item.name.indexOf(' - ') > -1 &&
        item.name.split(' - ').length > 1
      ) {
        const arrayName = item.name.split(' - ');
        item.name = arrayName[arrayName.length - 1] ?? item.name;
        item.artist = arrayName[0];
        item.albumArtist = arrayName[0];
        item.filename = `${item.name}.${item.extention}`;
      }
    } else {
      item.filename = `${item.name}-${item.id}.${item.extention}`;
    }
    updateItem(item)
      .finally(() => {
        let command = '';
        if (item.justAudio) {
          command +=
            os.platform() === 'win32' ? ffmpegWinBinary : ffmpegLinuxBinary;
          command += ` -i "media/${item.id}.${item.extention}" `;
          command += '-vn -acodec copy -y ';
          command += `-metadata title="${item.name}" `;
          command += `-metadata artist="${item.artist}" `;
          command += `-metadata album_artist="${item.albumArtist}" `;
          command += `-metadata album="${item.album}" `;
          command += `"media/${item.filename}" `;
          command += `&& rm "media/${item.id}.${item.extention}" `;
          if (os.platform() === 'win32') {
            command += `&& cp "media/${item.filename}" public/media`;
          }
          exec(command, (error) => {
            if (error) {
              console.log('exec error', error);
              return rej(error);
            }
            res(item);
          }).stdout?.on('data', onData);
        } else {
          command += ` mv "media/${item.id}.${item.extention}" "media/${item.filename}" `;
          if (os.platform() === 'win32') {
            command += ` && cp "media/${item.filename}" public/media `;
          }
          exec(command, (error) => {
            if (error) {
              return rej(error);
            }
            res(item);
          }).stdout?.on('data', onData);
        }
      })
      .catch((e) => console.log('error', e));
  });
};

const downloadVideo = (
  url: string,
  options: DownloadOptions,
  metadata: Metadata
): Promise<Item> => {
  return new Promise((res, rej) => {
    getOrCreateItem({ url, justAudio: options.justAudio })
      .then((i: Item) => {
        const item = { ...i };
        if (
          item.filename &&
          fs.existsSync(`media/${item.filename}`) &&
          item.status === 'ready' &&
          item.justAudio === options.justAudio &&
          !options.force
        ) {
          console.log('First catch');
          item.created = new Date();
          updateItem(item)
            .then((item) => res(item))
            .catch((e) => rej(e));
        } else if (
          item.filename &&
          fs.existsSync(`media/${item.filename}`) &&
          item.status === 'downloading'
        ) {
          console.log('First and half catch');
          item.status = 'ready';
          item.created = new Date();
          delete item.error;
          updateItem(item)
            .then((item) => res(item))
            .catch((e) => rej(e));
        } else if (
          fs.existsSync(`media/${item.id}.${item.extention}`) &&
          !fs.existsSync(`media/${item.filename}`) &&
          !options.force
        ) {
          console.log('Second catch');
          writeMetadataToFile(item, options.force)
            .then((item) => {
              item.status = 'ready';
              item.created = new Date();
              delete item.error;
              updateItem(item)
                .then((item) => res(item))
                .catch((e) => rej(e));
            })
            .catch((e) => rej(e)); /////// update status!
        } else if (fs.existsSync(`media/${item.filename}`)) {
          console.log('Third catch');
          item.status = 'ready';
          delete item.error;
          updateItem(item)
            .then((item) => res(item))
            .catch((e) => rej(e));
        } else {
          console.log('Final catch');
          if (isTiktok(url)) {
            url += '?is_from_webapp=1&sender_device=pc';
          }
          const iOS =
            metadata &&
            metadata.userAgent &&
            (metadata.userAgent.indexOf('iPad') > -1 ||
              metadata.userAgent.indexOf('iPhone') > -1);
          let command =
            os.platform() === 'win32'
              ? `${winBinary} "${url}" `
              : `${linuxBinary} "${url}" `;
          if (isYoutube(url) && !iOS) {
            command += `-f "${
              options.justAudio ? '' : 'bestvideo[ext=mp4]+'
            }bestaudio[ext=m4a]/${
              options.justAudio ? '' : 'bestvideo+'
            }bestaudio" `;
          } else {
            command += `--add-header "user-agent:Mozilla/5.0" -vU `;
          }
          if (isTiktok(url)) {
            command += ' -f 0 ';
          }
          if (isInstagram(url) || iOS) {
            command += ' -S "codec:h264" ';
          }
          if (os.platform() !== 'win32') {
            command += '--cookies /app/netscape-cookies.txt ';
          }
          // command += '--write-sub --write-auto-sub --sub-lang "en.*" ';
          if (!options.justAudio) {
            command += ' --merge-output-format mp4 ';
          }
          command += ` -o "media/${item.id}.%(ext)s"`;
          console.log('command:', command);
          item.remoteAddress = metadata.remoteAddress;
          item.justAudio = options.justAudio;
          item.status = 'downloading';
          item.created = new Date();
          item.extention = options.justAudio ? 'm4a' : 'mp4';
          delete item.error;
          updateItem(item)
            .then((item) => {
              res(item);
              exec(command, (error, _stdout) => {
                if (error) {
                  console.log('>> download error:', error);
                  const videoDeleted =
                    error.toString().search('Video not available') > -1;
                  console.log('>> videoDeleted:', videoDeleted);
                  item.status = videoDeleted ? 'deleted' : 'error';
                  item.error = String(error);
                  updateItem(item).catch((e) =>
                    console.log('>>> updateItem error:', e)
                  );
                } else {
                  writeMetadataToFile(item, options.force)
                    .then((item) => {
                      item.status = 'ready';
                      delete item.error;
                      updateItem(item).catch((e) =>
                        console.log('>>> updateItem error:', e)
                      );
                    })
                    .catch((e) =>
                      console.log('??? writeMetadataToFile error:', e)
                    );
                }
              }).stdout?.on('data', onData);
            })
            .catch((e) => rej(e));
        }
      })
      .catch((error) => {
        updateItem({ url, error, status: 'error' });
        rej(error);
      });
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
      const force = req.body?.data?.force ?? false;
      const options: DownloadOptions = {
        justAudio,
        force,
      };
      const userAgent = req.headers['user-agent'] ?? '';
      const metadata: Metadata = {
        remoteAddress:
          (requestIp.getClientIp(req)?.toString() ||
            req.socket.remoteAddress?.toString()) ??
          '',
        userAgent,
      };
      getVideoName(url, justAudio, force)
        .then((item: Item) => {
          updateItem({ ...item, status: 'downloading' })
            .then((item) => res.status(201).json(item))
            .catch((error) => res.status(400).send(error.toString()));
          downloadVideo(url, options, metadata)
            .then(() => console.log('downloadVideo success'))
            .catch((e) => console.log('downloadVideo error:', e));
        })
        .catch((error) => res.status(400).send(error.toString()));
    })
    .catch((error) => res.status(400).send(error.toString()));
}
