// /* eslint-disable @typescript-eslint/no-var-requires */
const { exec } = require('child_process');
const { exit } = require('process');
require('dotenv').config();

// Editable variables
const name = 'plant';
const namespace = 'plant';
const host = 'plant.iguzman.com.mx';
const apiURL = 'https://api.plant.iguzman.com.mx/v1/';
const registry = 'christopherguzman';
// Editable variables

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

const buildPackage = () => {
  return new Promise((res, rej) => {
    console.log('\n========= Building App =========');
    exec('npm run build', (err, stdout) => {
      if (err) return rej(err);
      res(stdout);
    }).stdout.on('data', onData);
  });
};

const buildDockerImage = () => {
  return new Promise((res, rej) => {
    console.log('\n========= Building Docker Image =========');
    exec(`docker build -t ${name} .`, (err, stdout) => {
      if (err) return rej(err);
      console.log('\nDocker Image built');
      res(stdout);
    }).stdout.on('data', onData);
  });
};

const tagDockerImage = () => {
  return new Promise((res, rej) => {
    console.log('\n========= Tagging Docker Image =========');
    exec(`docker tag ${name} ${registry}/${name}:${branch}`, (err, stdout) => {
      if (err) return rej(err);
      console.log('\nDocker Image tagged!');
      res(stdout);
    }).stdout.on('data', onData);
  });
};

const publishDockerImage = () => {
  return new Promise((res, rej) => {
    console.log('\n========= Publishing Docker Image =========');
    getBranchName()
      .then((branch) => {
        exec(`docker push ${registry}/${name}:${branch}`, (err, stdout) => {
          if (err) return rej(err);
          console.log('\nDocker Image published!');
          res(stdout);
        }).stdout.on('data', onData);
      })
      .catch((err) => {
        console.log('\nBuild Docker image error:', err);
      });
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
    command += '--set replicaCount=2 ';
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
  .then(() => buildPackage())
  .then(() => buildDockerImage())
  .then(() => tagDockerImage())
  .then(() => publishDockerImage())
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
