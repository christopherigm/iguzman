// /* eslint-disable @typescript-eslint/no-var-requires */
const { exec } = require('child_process');
const { exit } = require('process');
const fs = require('fs');

/**
 * Usage:
 * npm run create-next-app \
    appName=my-new-app \
    namespace=my-new-app \
    registry=christopherguzman \
    repository=my-new-app \
    host=my-new-app.iguzman.com.mx \
    apiHost=api.my-new-app.iguzman.com.mx
 */

if (process.argv.length < 8) {
  return exit(1);
}

const getArgument = (arg) => {
  return arg.split('=')[1] ?? '';
};

const appName = getArgument(process.argv[2]);
const namespace = getArgument(process.argv[3]);
const registry = getArgument(process.argv[4]);
const repository = getArgument(process.argv[5]);
const host = getArgument(process.argv[6]);
const apiHost = getArgument(process.argv[7]);

const listOfStringsToReplace = [
  'appName_REPLACE',
  'namespace_REPLACE',
  'registry_REPLACE',
  'repository_REPLACE',
  'host_REPLACE',
  'api_REPLACE',
];
const listOfStringsValues = [];
listOfStringsValues.push(appName);
listOfStringsValues.push(namespace);
listOfStringsValues.push(registry);
listOfStringsValues.push(repository);
listOfStringsValues.push(host);
listOfStringsValues.push(apiHost);

// console.log('>> listOfStringsToReplace', listOfStringsToReplace);
// console.log('>> listOfStringsValues', listOfStringsValues);

const listOfFiles = [
  'package.json',
  '.env.local',
  'build-and-deploy.js',
  'deploy.js',
  'next.config.js',
  'package.json',
  'deployment/Chart.yaml',
  'deployment/values.yaml',
  'pages/index.tsx',
];

const startTime = new Date(Date.now());

const onData = (data) => {
  console.log(data);
};

const replaceStrings = (file, string, replacement) => {
  return new Promise((res, rej) => {
    console.log(
      `Replacing "${string}" by "${replacement}"\nIn: apps/${appName}/${file}\n`
    );
    exec(
      `sed -i 's/${string}/${replacement}/g' apps/${appName}/${file}`,
      (err, stdout) => {
        if (err) {
          return rej(err);
        }
        res(stdout);
      }
    ).stdout.on('data', onData);
  });
};

const copyFile = (file) => {
  return new Promise((res, rej) => {
    exec(
      `cp apps/app-template-next-js/deployment/${file} ${file}`,
      (err, stdout) => {
        if (err) return rej(err);
        // res(stdout);
        replaceStrings(file)
          .then(() => res(stdout))
          .catch((e) => rej(e));
      }
    ).stdout.on('data', onData);
  });
};

const createTemplateFolder = () => {
  return new Promise((res, rej) => {
    exec(`cp -r apps/app-template-next-js apps/${appName}`, (err, stdout) => {
      if (err) {
        return rej(err);
      }
      res(stdout);
    }).stdout.on('data', onData);
  });
};

const createFolder = () => {
  return new Promise((res, rej) => {
    exec(`mkdir ${appName}`, (err, stdout) => {
      if (err) {
        return rej(err);
      }
      res(stdout);
    }).stdout.on('data', onData);
  });
};

const fixAppFiles = () => {
  return new Promise((res, rej) => {
    const promises = [];
    listOfFiles.forEach((i) => {
      listOfStringsToReplace.forEach((j, index) =>
        promises.push(replaceStrings(i, j, listOfStringsValues[index]))
      );
    });
    Promise.all(promises)
      .then(() => res(true))
      .catch((e) => rej(e));
  });
};

createTemplateFolder()
  .then(() => fixAppFiles())
  .then(() => {
    const endTime = new Date(Date.now());
    const difference = (endTime - startTime) / 100 / 60 / 60;
    console.log('\nProcess Complete!!');
    console.log(
      'Processing time:',
      Math.round((difference + Number.EPSILON) * 100) / 100,
      'minutes.'
    );
    exit(0);
  })
  .catch((err) => {
    if (err && err.response && err.response.statusText) {
      console.log('\nError:', err.response.statusText);
    } else {
      console.log('\nError:', err);
    }
    exit(1);
  });
