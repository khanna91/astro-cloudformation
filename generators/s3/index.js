const Generator = require('yeoman-generator');
const chalk = require('chalk');
const _ = require('lodash');
const fs = require('fs');
const YAML = require('yaml');
const inquirer = require('inquirer');
const { listAllResources } = require('../helper');

inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));

module.exports = class extends Generator {
  constructor(args, opts) {
    super(args, opts);

    // Process argument
    this.props = {};

    this.log(chalk.blue('Setting up AWS S3 Resources'));

    this.variableConfig = this.config.get('userDefinedVariables') || {};
  }

  _userVariableReplacer(originalString) {
    let _string = originalString;
    const regex = /\${(.*?)}/;
    let match = _string.match(regex);
    while (match) {
      _string = _string.replace(regex, this.variableConfig[match[1]]);
      match = _string.match(regex);
    }
    return _string;
  }

  _constructS3Schema() {
    const schema = {
      Type: 'AWS::S3::Bucket'
    };
    const data = this.answers;
    const s3Properties = {
      BucketName: this._userVariableReplacer(data.bucketName),
      AccessControl: data.accessControl,
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: data.blockPublicAcls,
        IgnorePublicAcls: data.ignorePublicAcls,
        BlockPublicPolicy: data.blockPublicPolicy,
        RestrictPublicBuckets: data.restrictPublicBuckets
      },
      Tags: '${file(./resources/tag.yml):Tags}', // eslint-disable-line
    };
    if (!_.isEmpty(data.resourceDependency)) {
      schema.DependsOn = data.resourceDependency;
    }
    if (data.corsEnable) {
      s3Properties.CorsConfiguration = {
        CorsRules: [
          {
            AllowedHeaders: ['*'],
            AllowedMethods: ['GET', 'HEAD'],
            AllowedOrigins: ['*'],
            ExposedHeaders: ['ETag'],
            MaxAge: 3000
          }
        ]
      };
    }
    schema.Properties = _(s3Properties).toPairs().sortBy(0).fromPairs()
      .value();
    return schema;
  }

  async prompting() {
    const done = this.async();
    const resources = await listAllResources(`./${this.config.get('baseFolder')}`);
    const userVariables = Object.keys(this.variableConfig).map(val => `\${${val}}`);
    inquirer.prompt([
      {
        type: 'input',
        name: 'resourceIdentifier',
        message: 'Specify AWS Resources Unique Identifier',
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'autocomplete',
        name: 'bucketName',
        message: 'What is your S3 Bucket Name?',
        source: (answersSoFar, input) => new Promise(resolve => resolve(_.filter(userVariables, _variable => (
          (!_.isNil(_variable) && !_.isEmpty(input))
            ? _variable.toLowerCase().indexOf(input.toLowerCase()) >= 0
            : true)))),
        suggestOnly: true,
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'list',
        name: 'accessControl',
        message: 'Bucket Access Control Type',
        choices: [
          { name: 'Private', value: 'Private' },
          { name: 'Public Read', value: 'PublicRead' },
          { name: 'Public Read Write', value: 'PublicReadWrite' },
          { name: 'Authenticated Read', value: 'AuthenticatedRead' },
          { name: 'Log Delivery Write', value: 'LogDeliveryWrite' },
          { name: 'Bucket Owner Read', value: 'BucketOwnerRead' },
          {
            name: 'Bucket Owner Full Control',
            value: 'BucketOwnerFullControl'
          },
          { name: 'Aws Exec Read', value: 'AwsExecRead' }
        ],
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'confirm',
        name: 'blockPublicAcls',
        message: 'Block Public ACLs?'
      },
      {
        type: 'confirm',
        name: 'ignorePublicAcls',
        message: 'Ignore Public ACLs?'
      },
      {
        type: 'confirm',
        name: 'blockPublicPolicy',
        message: 'Block Public Policy?'
      },
      {
        type: 'confirm',
        name: 'restrictPublicBuckets',
        message: 'Restrict Public Bucket?'
      },
      {
        type: 'confirm',
        name: 'corsEnable',
        message: 'Cors Enabled?'
      },
      {
        type: 'checkbox',
        name: 'resourceDependency',
        message: 'Is this resouce Dependent on any other resouce(s)',
        choices: resources,
        when: () => resources.length
      }
    ]).then((answers) => {
      this.answers = answers;
      done();
    });
  }

  async configuring() {
    const schema = this._constructS3Schema();
    const fileName = `./${this.config.get('baseFolder')}/s3.yml`;
    let s3Yaml;
    let file;
    try {
      file = fs.readFileSync(fileName, 'utf8');
      s3Yaml = YAML.parse(file);
      if (_.isNil(s3Yaml.Resources)) {
        s3Yaml = { Resources: {} };
      }
    } catch (err) {
      s3Yaml = { Resources: {} };
    }
    if (!_.isNil(s3Yaml.Resources[this.answers.resourceIdentifier])) {
      console.log(chalk.red('Error :: Duplicate Resource Identifier'));
      return;
    }
    s3Yaml.Resources[this.answers.resourceIdentifier] = schema;
    try {
      fs.writeFileSync(fileName, YAML.stringify(s3Yaml));
    } catch (err) {
      console.log(chalk.red('Error :: Failed to save config'));
    }
  }
};
