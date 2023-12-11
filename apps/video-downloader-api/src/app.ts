import os from 'node:os';
import express from 'express';
import fs from 'fs';
import { exec } from 'child_process';
import bodyParser from 'body-parser';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);
const port = 3000;
const platform = os.platform();
const hostname = process.env.HOSTNAME ?? 'localhost';
const winBinary = 'yt-dlp-win.exe';
const linuxBinary = '/app/yt-dlp';

const onData = (data) => {
  console.log('>>>', data);
};

const getBranchName = (): Promise<string> => {
  return new Promise((res, rej) => {
    exec('git branch --show-current', (err, stdout) => {
      if (err) {
        return rej(err);
      }
      const b = stdout.toString().replace(/(\r\n|\n|\r)/gm, '');
      res(b);
    }).stdout.on('data', onData);
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
    }).stdout.on('data', onData);
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
    }).stdout.on('data', onData);
  });
};

const isTwitter = (url: string): boolean => {
  return (
    url.search('https://x.com') > 1 || url.search('https://twitter.com') > 1
  );
};

const isYoutube = (url: string): boolean => {
  return (
    url.search('https://youtube.com') > -1 || url.search('https://youtu.be') > 1
  );
};

const getVideoName = (id: string, url: string): Promise<string> => {
  return new Promise((res, rej) => {
    let command =
      os.platform() === 'win32'
        ? `${winBinary} "${url}" --print "%(title)s"`
        : `${linuxBinary} "${url}" --print "%(title)s"`;
    if (isTwitter(url)) {
      command += ` --username ${process.env.TWITTER_USERNAME}`;
      command += ` --password ${process.env.TWITTER_PASSWORD}`;
    }
    exec(command, (err, videoName: string) => {
      if (err) {
        if (err.cmd && isTwitter(url)) delete err.cmd;
        return rej(err);
      }
      let name = videoName;
      name = name.replace(/\n/g, '');
      name = name.replace(/[^\x00-\x7F]/g, '');
      name = name.replace(/https\:\/\//g, '');
      name = name.replace(/\//g, '');
      name = name.replace(/\./g, '');
      name = name.replace(/\@/g, '');
      name = name.replace(/\#/g, '');
      name = name.replace(/  /, '');
      name = name.replace(/(?:https?|ftp):\/\/[\n\S]+/g, '');
      if (name.length > 250) {
        name = name.slice(0, 250);
      }
      if (name[name.length - 1] === ' ') {
        name = name.slice(0, name.length - 1);
      }
      entities[id].name = name;
      res(name);
    }).stdout.on('data', onData);
  });
};

const moveVideo = (videoName: string, id: string): Promise<string> => {
  return new Promise((res, rej) => {
    if (!fs.existsSync(`${id}.mp4`)) {
      return rej(new Error('File does not exist.'));
    }
    exec(`mv ${id}.mp4 "media/${videoName}.mp4"`, (err, stdout) => {
      if (err) {
        return rej(err);
      }
      res(stdout);
    }).stdout.on('data', onData);
  });
};

const getVideo = (url: string, id: string): Promise<string> => {
  return new Promise((res, rej) => {
    let command =
      os.platform() === 'win32'
        ? `${winBinary} "${url}" `
        : `${linuxBinary} "${url}" `;
    if (isYoutube(url)) {
      command += `-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio" `;
    } else {
      command += `--add-header "user-agent:Mozilla/5.0" -vU `;
    }
    if (isTwitter(url)) {
      command += `--username ${process.env.TWITTER_USERNAME} `;
      command += `--password ${process.env.TWITTER_PASSWORD} `;
    }
    command += '--merge-output-format mp4 ';
    command += `-o "${id}.%(ext)s"`;
    console.log('Command', command);
    exec(command, (err, stdout) => {
      if (err) {
        if (err.cmd && isTwitter(url)) delete err.cmd;
        return rej(err);
      }
      res(stdout);
    }).stdout.on('data', onData);
  });
};

const entities = {};

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
  const url = req.body?.url ?? null;
  if (!url) {
    return res.status(400).send('No URL');
  }
  const id = saveEntity(url);
  entities[id].status = 'downloading';
  getVideo(url, id)
    .then((_v) => getVideoName(id, url))
    .then((videoName) => moveVideo(videoName, id))
    .then((_v) => (entities[id].status = 'ready'))
    .catch((error) => {
      entities[id].status = 'error';
      entities[id].error = error;
    });
  res.json({
    message: 'ok',
    ...entities[id],
  });
});

app.post('/get-video-name', (req, res) => {
  const url = req.body?.url ?? null;
  if (!url) {
    return res.status(400).send('No URL');
  }
  const id = saveEntity(url);
  getVideoName(id, url)
    .then((_v) => res.json(entities[id]))
    .catch((error) => res.status(400).send(error));
});

app.get('/get-videos', (req, res) => {
  res.json(entities);
});

app.get('/get-videos/:id', (req, res) => {
  const entity = entities[req.params.id ?? ''] ?? null;
  if (!entity) {
    return res.status(400).send('No entity');
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
