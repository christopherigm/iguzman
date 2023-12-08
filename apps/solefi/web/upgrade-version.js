/* eslint-disable @typescript-eslint/no-var-requires */
'use strict';

const fs = require('fs');
const packageJSON = require('./package.json');
const versionJSON = require('./src/assets/version.json');

const upgradeVersion = ( packageJSON, filename ) => {
  const a = packageJSON.version.split('.');
  console.log(`${filename} current version: ${packageJSON.version}`);
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
  packageJSON.version = `${a[0]}.${a[1]}.${a[2]}`;
  console.log(`${filename} new version: ${packageJSON.version}`);
  const data = JSON.stringify(packageJSON, null, 2);
  fs.writeFileSync(filename, data);
};

upgradeVersion(packageJSON, './package.json');
upgradeVersion(versionJSON, './src/assets/version.json');

return;
