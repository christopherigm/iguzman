// /* eslint-disable @typescript-eslint/no-var-requires */
const { exec } = require('child_process');
const { exit } = require('process');
const replace = require('replace');

// Editable variables
const name = 'my-cv';
const namespace = 'my-cv';
const host = 'resume.iguzman.com.mx';
const apiURL = 'https://api.resume.iguzman.com.mx/v1/';
const registry = 'christopherguzman';
// Editable variables

let branch = '';
const startTime = new Date(Date.now());

const replaceWraper = (regex, replacement, file) => {
  replace({
    regex: regex,
    replacement: replacement,
    paths: [file],
    recursive: false,
    silent: true
  });
};

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

const setEnvValues = (isMobileApp = false) => {
  return new Promise((res, rej) => {
    console.log('\n========= Set Env values =========');
    exec(`echo REACT_APP_API_URL=${apiURL} > .env`, (err) => {
      if (err) return rej(err);
      exec(`echo REACT_APP_BRANCH_NAME=${branch} >> .env`, (err) => {
        if (err) return rej(err);
        exec(`echo REACT_APP_PRODUCTION=${true} >> .env`, (err) => {
          if (err) return rej(err);
          if (isMobileApp) {
            return exec(`echo REACT_APP_IS_MOBILE_APP=${true} >> .env`, (err) => {
              if (err) return rej(err);
              res(true);
            }).stdout.on('data', onData);
          }
          res(true);
        }).stdout.on('data', onData);
      }).stdout.on('data', onData);
    }).stdout.on('data', onData);
  });
};

const cleanPublicFolder = () => {
  return new Promise((res, rej) => {
    console.log('\n========= Clean APK Cache =========');
    exec('rm public/assets/app.apk public/assets/app.aab', (err, stdout) => {
      if (err) return rej(err);
      console.log('\nAPK cache cleaned!');
      res(stdout);
    }).stdout.on('data', onData);
  });
};

const buildAppDistFiles = () => {
  return new Promise((res, rej) => {
    console.log('\n========= Build App Distribution Files =========');
    exec('npm run build', (err, stdout) => {
      if (err) return rej(err);
      console.log('\nDistribution Files created!');
      res(stdout);
    }).stdout.on('data', onData);
  });
};

const cleanAPKCache = () => {
  return new Promise((res, rej) => {
    console.log('\n========= Clean APK Cache =========');
    exec('rm -rf android/www', (err, stdout) => {
      if (err) return rej(err);
      console.log('\nAPK cache cleaned!');
      res(stdout);
    }).stdout.on('data', onData);
  });
};

const createWWWDir = () => {
  return new Promise((res, rej) => {
    console.log('\n========= Create WWW Directory =========');
    exec('cp -r build android/www', (err, stdout) => {
      if (err) return rej(err);
      console.log('\nWWW directory created!');
      res(stdout);
    }).stdout.on('data', onData);
  });
};

const prepareAPKIndex = () => {
  return new Promise((res) => {
    console.log('\n========= Prepare APK Index =========');
    replaceWraper('\/static/', 'static/', './android/www/index.html');
    replaceWraper('\/assets/', 'assets/', './android/www/index.html');
    replaceWraper('{{seo.title}}', 'title', './android/www/index.html');
    replaceWraper('{{seo.og_description}}', 'og_description', './android/www/index.html');
    replaceWraper('{{seo.keywords}}', 'keywords', './android/www/index.html');
    replaceWraper('{{seo.og_site_name}}', 'og_site_name', './android/www/index.html');
    replaceWraper('{{seo.url}}', 'url', './android/www/index.html');
    replaceWraper('{{seo.img_og_picture}}', 'img_og_picture', './android/www/index.html');
    replaceWraper('{{{escapeJS data}}}', '', './android/www/index.html');
    res(true);
  });
};

const buildAPK = () => {
  return new Promise((res, rej) => {
    console.log('\n========= Build APK =========');
    exec('cd android && cordova build android --release -- --keystore=app.keystore --storePassword=$KEYSTORE_PASSWORD --password=$KEYSTORE_PASSWORD --alias=app --packageType=bundle', (err, stdout) => {
      if (err) return rej(err);
      console.log('\nAPK created!');
      res(stdout);
    }).stdout.on('data', onData);
  });
};

const signAPK = () => {
  return new Promise((res, rej) => {
    console.log('\n========= Build APK =========');
    exec('cd android && $JAVA_HOME/bin/jarsigner -verbose -sigalg SHA256withRSA -digestalg SHA -keystore app.keystore -storepass $KEYSTORE_PASSWORD platforms/android/app/build/outputs/bundle/release/app-release.aab app', (err, stdout) => {
      if (err) return rej(err);
      console.log('\nAPK signed!');
      res(stdout);
    }).stdout.on('data', onData);
  });
};

const copyAPK = () => {
  return new Promise((res, rej) => {
    console.log('\n========= Copy APK =========');
    exec('cp android/platforms/android/app/build/outputs/bundle/release/app-release.aab public/assets/app.aab', (err, stdout) => {
      if (err) return rej(err);
      console.log('\nAPK copied!');
      res(stdout);
    }).stdout.on('data', onData);
  });
};

const optimizeAPK = () => {
  return new Promise((res, rej) => {
    console.log('\n========= Optimize APK =========');
    exec('zipalign -v 9 public/assets/app.aab public/assets/app.apk', (err, stdout) => {
      if (err) return rej(err);
      console.log('\nAPK optimized!');
      res(stdout);
    }).stdout.on('data', onData);
  });
};

const removeCordovaReference = () => {
  return new Promise((res, _rej) => {
    console.log('\n========= Remove Cordova Reference =========');
    replaceWraper('./cordova.js', '', './build/index.html');
    res(true);
  });
};

const buildDockerImage = () => {
  return new Promise((res, rej) => {
    console.log('\n========= Building Docker Image =========');
    /***
     * docker build -t next-js-resume-web-app .
     */
    exec(`docker build -t ${name} . --build-arg REACT_APP_API_URL=${apiURL} --build-arg REACT_APP_BRANCH_NAME=${branch} --build-arg REACT_APP_PRODUCTION=true `, (err, stdout) => {
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
    exec(`helm delete ${name} -n ${namespace}`, (err, stdout) => {
      if (err) return rej(err);
      res(stdout);
    }).stdout.on('data', onData);
  });
};

const deployMicroservice = () => {
  return new Promise((res, rej) => {
    exec(`helm install ${name} deployment --namespace=${namespace} --set ingress.enabled=true --set ingress.host=${host} --set image.tag=${branch}`, (err, stdout) => {
      if (err) return rej(err);
      res(stdout);
    }).stdout.on('data', onData);
  });
};

getBranchName()
  .then(() => setEnvValues(true))
  .then(() => cleanPublicFolder())
  .then(() => buildAppDistFiles())
  .then(() => cleanAPKCache())
  .then(() => createWWWDir())
  .then(() => prepareAPKIndex())
  .then(() => buildAPK())
  .then(() => signAPK())
  .then(() => copyAPK())
  .then(() => optimizeAPK())
  .then(() => setEnvValues())
  .then(() => buildAppDistFiles())
  .then(() => removeCordovaReference())
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
