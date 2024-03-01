const fs = require('fs');

const file = 'swagger.json';
const swagger = JSON.parse(fs.readFileSync(file));

const oldVersion = swagger.info.version;
const newVersion = process.argv[2];

console.log(`Updating swagger version from ${oldVersion} to ${newVersion}`);

swagger.info.version = newVersion;
fs.writeFileSync(file, JSON.stringify(swagger, null, 2))