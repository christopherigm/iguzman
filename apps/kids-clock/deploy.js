// /* eslint-disable @typescript-eslint/no-var-requires */
const { exec } = require('child_process');
const { exit } = require('process');
const fs = require('fs');

// Editable variables
const name = 'kids-clock';
const namespace = 'kids';
const host = 'clock.kids.iguzman.com.mx';
const envFile = '.env';
// Editable variables

const upgradeVersion = (version) => {
  const a = version.split('.');
  if (Number(a[2]) === 9) {
    if (Number(a[1]) === 9) {
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
allFileContents.split(/\r?\n/).forEach((line) => {
  if (line !== '' && line.substring(0, 7) === 'VERSION') {
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
  return new Promise((res, rej) => {
    exec(`helm delete ${name} -n ${namespace}`, (_err, stdout) => {
      res(stdout);
    }).stdout.on('data', onData);
  });
};

const deployMicroservice = () => {
  return new Promise((res, rej) => {
    let command = `helm install ${name} deployment `;
    command += `--namespace=${namespace} `;
    command += '--set replicaCount=1 ';
    command += `--set ingress.enabled=true `;
    command += `--set ingress.host=${host} `;
    command += `--set image.tag=${branch}`;
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
    const difference = (endTime - startTime) / 100 / 60 / 60;
    console.log('\nProcess Complete!!');
    console.log('\nBranch:', branch);
    console.log('Starting time:', startTime);
    console.log('Ending time:', endTime);
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
