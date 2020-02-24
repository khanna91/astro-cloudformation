const glob = require('glob');
const fs = require('fs');
const YAML = require('yaml');

const listAllResources = baseFolder => new Promise((resolve) => {
  glob(`${baseFolder}/*.yml`, (err, files) => {
    if (err) {
      console.log('Failed to read files');
      process.exit(0);
    }
    const resources = [];
    files.forEach((fileName) => {
      const file = fs.readFileSync(fileName, 'utf8');
      const resourceConfig = YAML.parse(file);
      resources.push(...Object.keys(resourceConfig.Resources || {}));
    });
    return resolve(resources);
  });
});

module.exports = {
  listAllResources
};
