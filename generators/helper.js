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

const listCloudfrontIdentity = async (baseFolder) => {
  try {
    const file = fs.readFileSync(`${baseFolder}/cf.yml`, 'utf8');
    const resourceConfig = YAML.parse(file);
    const identities = [];
    Object.keys(resourceConfig.Resources || {}).forEach((index) => {
      if (resourceConfig.Resources[index].Type === 'AWS::CloudFront::CloudFrontOriginAccessIdentity') {
        identities.push(`!Ref:${index}`);
      }
    });
    return identities;
  } catch (err) {
    return [];
  }
};

module.exports = {
  listAllResources,
  listCloudfrontIdentity
};
