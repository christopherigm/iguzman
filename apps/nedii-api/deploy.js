/* eslint-disable @typescript-eslint/no-var-requires */
const { exec } = require('child_process');
const { exit } = require('process');
const fs = require('fs');
require('dotenv').config();

// Editable variables
const name = 'nedii-api';
const namespace = 'nedii';
const host = 'api.nedii.iguzman.com.mx';
const registry = 'christopherguzman';
const envFile = '.env';
// Editable variables

const upgradeVersion = (version) => {
  const a = version.split('.');
  if ( Number(a[2]) === 9 ) {
    if ( Number(a[1]) === 9 ) {
      a[0] = Number(a[0]) + 1;
      a[1] = 0;
    } else {
      a[1] = Number(a[1]) + 1;
    }
    a[2] = 0;
  } else {
    a[2] = Number(a[2]) + 1;
  }
  const newVersion = `${a[0]}.${a[1]}.${a[2]}`;
  return newVersion;
};

const allFileContents = fs.readFileSync(envFile, 'utf-8');
let newLines = '';
allFileContents.split(/\r?\n/).forEach(line =>  {
  if (line !== '' && line.substring(0,7) === 'VERSION') {
    const value = line.split('=')[1].replace(/\'/g, '');
    upgradeVersion(value);
    newLines += `VERSION='${upgradeVersion(value)}'\r\n`;
  } else if (line !== '') {
    newLines += `${line}\r\n`;
  }
});
fs.writeFileSync(envFile, newLines);

let branch = '';
const startTime = new Date(Date.now());

const onData = (data) => {
  console.log(data);
};

const getSecretKey = (count = 0, value = '') => {
  if (count > 5 ) return value;
  value += Math.trunc(Math.random(1)*99999);
  count++;
  return getSecretKey(count, value);
};

const getBranchName = () => {
  return new Promise((res, rej) => {
    exec('git branch --show-current', (err, stdout) => {
      if (err) return rej(err);
      const b = stdout.toString().replace(/(\r\n|\n|\r)/gm, '');
      branch = b;
      res(branch);
    }).stdout.on('data', onData);
  });
};

const deleteDeployment = () => {
  return new Promise((res) => {
    exec(`helm delete ${name} -n ${namespace}`, (err, stdout) => {
      if (err) return res(err);
      res(stdout);
    }).stdout.on('data', onData);
  });
};

const deployMicroservice = () => {
  return new Promise((res, rej) => {
    let command = `helm install ${name} deployment `;
    command += `--namespace=${namespace} `;
    command += `--set replicaCount=${process.env.REPLICAS} `;
    command += `--set config.VERSION=${process.env.VERSION} `;
    command += `--set config.SECRET_KEY=${getSecretKey()} `;
    command += `--set config.ENVIRONMENT=production `;
    command += `--set config.BRANCH=${branch} `;
    command += `--set config.DB_HOST=${process.env.DB_HOST} `;
    command += `--set config.DB_NAME=${process.env.DB_NAME} `;
    command += `--set config.DB_USER=${process.env.DB_USER} `;
    command += `--set config.DB_PASSWORD=${process.env.DB_PASSWORD} `;
    command += `--set config.EMAIL_HOST_USER=${process.env.EMAIL_HOST_USER} `;
    command += `--set config.EMAIL_HOST_PASSWORD=${process.env.EMAIL_HOST_PASSWORD} `;
    command += `--set config.RUN_FIXTURES=${process.env.RUN_FIXTURES} `;
    command += `--set config.API_URL="${process.env.API_URL}" `;
    command += `--set config.WEB_APP_URL="${process.env.WEB_APP_URL}" `;
    command += `--set ingress.enabled=true `;
    command += `--set ingress.host=${host} `;
    command += `--set image.tag=${branch}`;
    console.log('command:', command);
    exec(command, (err, stdout) => {
      if (err) return rej(err);
      res(stdout);
    }).stdout.on('data', onData);
  });
};

getBranchName()
  .then(() => deleteDeployment())
  .then(() => deployMicroservice())
  .then(() => {
    const endTime = new Date(Date.now());
    const difference = (((endTime - startTime) / 100 ) / 60) / 60;
    console.log('\nProcess Complete!!');
    console.log('\nBranch:', branch);
    console.log('Starting time:', startTime);
    console.log('Ending time:', endTime);
    console.log('Processing time:', Math.round((difference + Number.EPSILON) * 100) / 100, 'minutes.');
    exit(0);
  })
  .catch((err) => {
    if ( err && err.response && err.response.statusText ) {
      console.log('\nError:', err.response.statusText);
    } else {
      console.log('\nError:', err);
    }
    exit(1);
  });
