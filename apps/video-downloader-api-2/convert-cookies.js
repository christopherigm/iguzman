/**
 * @file Convert cookies copy/pasted from Chrome's Application -> Storage -> Cookies -> [domain] table,
 * into the Netscape cookies format used by tools like `curl` or `youtube-dl`.
 * https://apple.stackexchange.com/questions/349697/how-to-use-youtube-dl-cookies
 */
const fs = require('fs');

const filename = process.argv[2];
if (!filename) {
  process.exit(1);
}

const content = fs.readFileSync(filename, 'utf8');
const cookies = content.split('\n');

console.log('# Netscape HTTP Cookie File');

for (const cookie of cookies) {
  let [name, value, domain, path, expiration /* size */, , httpOnly] =
    cookie.split('\t');
  if (!name) continue;
  if (domain.charAt(0) !== '.') domain = '.' + domain;
  httpOnly = httpOnly === '✓' ? 'TRUE' : 'FALSE';
  if (expiration === 'Session')
    expiration = new Date(Date.now() + 86400 * 1000);
  expiration = Math.trunc(new Date(expiration).getTime() / 1000);
  console.log(
    [domain, 'TRUE', path, httpOnly, expiration, name, value].join('\t')
  );
}
