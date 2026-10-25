const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { version } = require('../package.json');
const file = `Cirrus-Weather-${version}.exe`;
const hash = createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', 'release', file))).digest('hex');
fs.writeFileSync(path.join(__dirname, '..', 'release', 'SHA256.txt'), `${hash}  ${file}\n`);
console.log(`SHA-256 written for ${file}`);
