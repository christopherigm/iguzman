/* eslint-disable @typescript-eslint/no-var-requires */
const { exec } = require('child_process');
const { exit } = require('process');
const https = require('https');
const axios = require('axios');

// Editable variables
const name = 'solefi-api';
const jenkinsURL = 'https://jenkins.iguzman.com.mx';
const jenkinsURLProd = 'https://jenkins.vaggustudios.com';
const registry = 'registry.iguzman.com.mx';
// Editable variables

const args = process.argv;
const isProduction = args && args.length &&
  args.length === 3 && args[2] === '--production' ? true : false;
const jenkins = `${ isProduction ? jenkinsURLProd : jenkinsURL}/generic-webhook-trigger/invoke?token=${name}`;

let branch = '';
const startTime = new Date(Date.now());

const instance = axios.create({
  httpsAgent: new https.Agent({
    rejectUnauthorized: false
  })
});

const triggerJenkinsJob = () => {
  return new Promise((res, rej) => {
    console.log('\n========= Triggering Jenkins Job =========');
    instance.post(jenkins, {
      BRANCH: branch
    })
      .then((response) => {
        res(response.data);
      })
      .catch((error) => {
        rej(error);
      });
  });
};

const getBranchName = () => {
  return new Promise((res, rej) => {
    exec('git branch --show-current', (err, stdout) => {
      if (err) return rej(err);
      const b = stdout.toString().replace(/(\r\n|\n|\r)/gm, '');
      branch = b;
      res(branch);
    });
  });
};

const tagDockerImage = () => {
  return new Promise((res, rej) => {
    console.log('\n========= Tagging Docker Image =========');
    exec(`docker tag ${name} ${registry}/${name}:${branch}`, (err, stdout) => {
      if (err) return rej(err);
      console.log('\nDocker Image tagged!');
      res(stdout);
    });
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
        });
      })
      .catch((err) => {
        console.log('\nBuild Docker image error:', err);
      });
  });
};

const buildDockerImage = () => {
  return new Promise((res, rej) => {
    console.log('\n========= Building Docker Image =========');
    exec(`docker build -t ${name} .`, (err, stdout) => {
      if (err) return rej(err);
      console.log('\nDocker Image built');
      res(stdout);
    });
  });
};

getBranchName()
  .then(() => buildDockerImage())
  .then(() => tagDockerImage())
  .then(() => publishDockerImage())
  .then(() => triggerJenkinsJob())
  .then((response) => {
    if ( response && response.jobs && typeof response.jobs === 'object' ) {
      for (const key in response.jobs) {
        if (Object.hasOwnProperty.call(response.jobs, key)) {
          const element = response.jobs[key];
          if ( element && element.triggered ) {
            console.log('\nProces completed!:', response.message);
            console.log(`\nImage: ${registry}/${name}:${branch}`);
          }
        }
      }
    }
    const endTime = new Date(Date.now());
    const difference = (((endTime - startTime) / 100 ) / 60) / 60;
    console.log('\nStarting time:', startTime);
    console.log('Ending time:', endTime);
    console.log('Processing time:', Math.round((difference + Number.EPSILON) * 100) / 100, 'minutes.');
    exit(1);
  })
  .catch((err) => {
    if ( err && err.response && err.response.statusText ) {
      console.log('\nError:', err.response.statusText);
    } else {
      console.log('\nError:', err);
    }
    exit(1);
  });
