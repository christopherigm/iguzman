import os from 'node:os';
import express from 'express';
import fs from 'fs';
import { exec } from 'child_process';
import bodyParser from 'body-parser';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';
import { isYoutube } from '@repo/utils';
// const isYoutube = (s: string) => true;

const app = express();
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);
const port = 3001;
const winBinary = 'yt-dlp-win.exe';
const linuxBinary = '/app/yt-dlp';

type Ent = {
  [index: string]: {
    id?: string;
    name?: string;
    extention?: 'm4a' | 'mp4';
    justAudio?: boolean;
    status?: string;
    url?: string;
    error?: string;
  };
};

type DownloadOptions = {
  justAudio: boolean;
};

const entities: Ent = {};

const allowedOrigins = ['*', 'localhost', '127.0.0.1'];
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        const msg =
          'The CORS policy for this site does not allow access from the specified Origin.';
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
  })
);

const onData = (data: any) => {
  console.log('>>>', data);
};

const getBranchName = (): Promise<string> => {
  return new Promise((res, rej) => {
    exec('git branch --show-current', (err, stdout) => {
      if (err || !stdout) {
        return rej(err);
      }
      const b = stdout.toString().replace(/(\r\n|\n|\r)/gm, '');
      res(b);
    }).stdout?.on('data', onData);
  });
};

const getPath = (): Promise<string> => {
  return new Promise((res, rej) => {
    exec('pwd', (err, stdout) => {
      if (err) {
        return rej(err);
      }
      const data = stdout.toString().replace(/(\r\n|\n|\r)/gm, '');
      res(data);
    }).stdout?.on('data', onData);
  });
};

const getVideoFormats = (url: string): Promise<string> => {
  return new Promise((res, rej) => {
    const command =
      os.platform() === 'win32'
        ? `${winBinary} "${url}" --list-formats`
        : `${linuxBinary} "${url}" --list-formats`;
    exec(command, (err, stdout) => {
      if (err) {
        return rej(err);
      }
      res(stdout);
    }).stdout?.on('data', onData);
  });
};

const getVideoName = (id: string, url: string): Promise<string> => {
  return new Promise((res, rej) => {
    let command =
      os.platform() === 'win32'
        ? `${winBinary} "${url}" --print "%(title)s"`
        : `${linuxBinary} "${url}" --print "%(title)s"`;
    if (os.platform() !== 'win32') {
      command += ' --cookies /app/netscape-cookies.txt';
    }
    exec(command, (err, videoName: string) => {
      if (err) {
        console.log('Error, getVideoName:', err);
        return rej(err);
      }
      let name = videoName;
      name = name.replace(/\n/g, '');
      name = name.replace(/https\:\/\//g, '');
      name = name.replace(/\//g, '');
      name = name.replace(/\./g, '');
      name = name.replace(/\@/g, '');
      name = name.replace(/\#/g, '');
      name = name.replace(/\?/g, '');
      name = name.replace(/  /, '');
      name = name.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '');
      if (name.length > 128) {
        name = name.slice(0, 128);
      }
      if (name[name.length - 1] === ' ') {
        name = name.slice(0, name.length - 1);
      }
      const e = entities[id];
      if (e) {
        e.name = name;
        entities[id] = e;
      }
      res(name);
    }).stdout?.on('data', onData);
  });
};

const moveVideo = (
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

const getVideo = (
  url: string,
  id: string,
  options: DownloadOptions
): Promise<string> => {
  return new Promise((res, rej) => {
    let command =
      os.platform() === 'win32'
        ? `${winBinary} "${url}" `
        : `${linuxBinary} "${url}" `;
    if (isYoutube(url)) {
      command += `-f "${
        options.justAudio ? '' : 'bestvideo[ext=mp4]+'
      }bestaudio[ext=m4a]/${options.justAudio ? '' : 'bestvideo+'}bestaudio" `;
      console.log('???? command:', command);
    } else {
      command += `--add-header "user-agent:Mozilla/5.0" -vU `;
    }
    if (os.platform() !== 'win32') {
      command += '--cookies /app/netscape-cookies.txt ';
    }
    // command += '--write-sub --write-auto-sub --sub-lang "en.*" ';
    if (options.justAudio) {
      command += ' ';
    } else {
      command += '--merge-output-format mp4 ';
    }
    command += `-o "${id}.%(ext)s"`;
    console.log('Command', command);
    exec(command, (err, stdout) => {
      if (err) {
        console.log('Error, getVideo:', err);
        return rej(err);
      }
      res(stdout);
    }).stdout?.on('data', onData);
  });
};

const saveEntity = (url: string): string => {
  const id = uuidv4();
  const status = 'none';
  entities[id] = {
    id,
    status,
    url,
  };
  return id;
};

app.post('/download-video', (req, res) => {
  const url = req.body?.data?.url ?? null;
  if (!url) {
    return res.status(400).json({
      id: '',
      message: 'Error',
      status: 'error',
      url: '',
      error: 'No url provided',
    });
  }
  const options: DownloadOptions = {
    justAudio: req.body?.data?.justAudio ?? false,
  };
  const id = req.body?.data?.id ?? saveEntity(url);
  const extention = options.justAudio ? 'm4a' : 'mp4';
  const e = entities[id];
  if (e) {
    e.id = id;
    e.url = url;
    e.status = 'downloading';
    e.justAudio = options.justAudio ?? false;
    e.extention = extention;
    e.error = '';
    entities[id] = e;
  } else {
    entities[id] = {
      id,
      url,
      status: 'downloading',
      justAudio: options.justAudio ?? false,
      extention,
      error: '',
    };
  }
  getVideoName(id, url);
  getVideo(url, id, options)
    .then((_v) => getVideoName(id, url))
    .then((videoName) => moveVideo(videoName, id, extention))
    .then((_v) => {
      const e = entities[id];
      if (e) {
        e.status = 'ready';
        entities[id] = e;
      }
    })
    .catch((error) => {
      const e = entities[id];
      if (e) {
        console.log('errors /download-video:', error);
        e.status = 'error';
        e.error = error;
        entities[id] = e;
      }
    });
  res.json({
    message: 'ok',
    ...entities[id],
  });
});

app.post('/get-video-name', (req, res) => {
  const url = req.body?.url ?? null;
  if (!url) {
    return res.status(400).json({
      id: '',
      message: 'Error',
      status: 'error',
      url: '',
      error: 'No url provided',
    });
  }
  const id = saveEntity(url);
  getVideoName(id, url)
    .then((_v) => res.json(entities[id]))
    .catch((error) => res.status(400).send(error));
});

// app.get('/get-videos', (_req, res) => {
//   res.json(entities);
// });

app.get('/get-videos/:id', (req, res) => {
  const entity = entities[req.params.id ?? ''] ?? null;
  if (!entity) {
    return res.status(400).json({
      id: req.params.id,
      message: 'Error',
      status: 'error',
      url: '',
      error: 'Not found',
    });
  }
  res.json(entity);
});

app.get('/', (_req, res) => {
  getBranchName()
    .then((branch: string) => {
      res.send(`Hello World! (Branch: ${branch})`);
    })
    .catch((_error) => {
      res.send('Hello World!');
    });
});

app.listen(port, () => {
  return console.log(`Express is listening at http://localhost:${port}`);
});
