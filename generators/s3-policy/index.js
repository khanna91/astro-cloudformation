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
    this.statements = [];

    this.log(chalk.blue('Setting up AWS S3 Bucket Policy'));

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

  _constructSchema() {
    const schema = {
      Type: 'AWS::S3::BucketPolicy',
      Properties: {
        Tags: '${file(./resources/tag.yml):Tags}', // eslint-disable-line
      }
    };
    const data = this.answers;
    if (!_.isEmpty(data.resourceDependency)) {
      schema.DependsOn = data.resourceDependency;
    }
    schema.Properties.Bucket = this._userVariableReplacer(data.bucket);
    const statements = [];
    this.statements.forEach((statement, key) => {
      statements.push({
        Sid: `${data.resourceIdentifier}-Statement-${key}`,
        Effect: statement.effect,
        Principal: {
          AWS: statement.principal
        },
        Action: statement.action,
        Resource: statement.resources.split(',').filter(val => !_.isNil(val) && !_.isEmpty(val)).map(val => val.trim())
      });
    });
    schema.Properties.PolicyDocument = {
      Id: `${data.resourceIdentifier}-Policy`,
      Version: '2008-10-17',
      Statement: statements
    };
    schema.Properties = _(schema.Properties).toPairs().sortBy(0).fromPairs();
    return schema;
  }

  async _statementPrompt(index) {
    const answer = await this.prompt([
      {
        type: 'checkbox',
        name: 'action',
        message: `Statement - ${index} Policy Action(s)`,
        choices: [
          's3:GetObject', 's3:PutObject', 's3:GetObjectAcl', 's3:PutObjectAcl',
          's3:AbortMultipartUpload', 's3:BypassGovernanceRetention', 's3:DeleteObject',
          's3:DeleteObjectTagging', 's3:DeleteObjectVersion', 's3:DeleteObjectVersionTagging',
          's3:GetObjectLegalHold', 's3:GetObjectRetention', 's3:GetObjectTagging', 's3:GetObjectTorrent',
          's3:GetObjectVersion', 's3:GetObjectVersionAcl', 's3:GetObjectVersionTagging',
          'GetObjectVersionTorrent', 's3:ListMultipartUploadParts', 's3:PutObjectAcl', 's3:PutObjectLegalHold',
          's3:PutObjectRetention', 's3:PutObjectTagging', 's3:PutObjectVersionAcl', 's3:PutObjectVersionTagging',
          's3:RestoreObject'
        ]
      },
      {
        type: 'list',
        name: 'effect',
        message: `Statement - ${index} Policy Effect`,
        choices: ['Allow', 'DENY']
      },
      {
        type: 'input',
        name: 'principal',
        message: `Statement - ${index} Policy Principal`,
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'input',
        name: 'resources',
        message: `Statement - ${index} Policy Resources`,
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      }
    ]);
    this.statements.push(answer);
  }

  async prompting() {
    const done = this.async();
    const resources = await listAllResources(`./${this.config.get('baseFolder')}`);
    const userVariables = [
      ...Object.keys(this.variableConfig).map(val => `\${${val}}`)
      // ...resources.map(val => `!${val}`)
    ];
    inquirer.prompt([
      {
        type: 'input',
        name: 'resourceIdentifier',
        message: 'Specify AWS Resources Unique Identifier',
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'autocomplete',
        name: 'bucket',
        message: 'The name of the Amazon S3 bucket to which the policy applies?',
        source: (answersSoFar, input) => new Promise(resolve => resolve(_.filter(userVariables, _variable => (
          (!_.isNil(_variable) && !_.isEmpty(input))
            ? _variable.toLowerCase().indexOf(input.toLowerCase()) >= 0
            : true)))),
        suggestOnly: true,
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'checkbox',
        name: 'resourceDependency',
        message: 'Is this resouce Dependent on any other resouce(s)',
        choices: resources,
        when: () => resources.length
      },
      {
        type: 'number',
        name: 'statementCount',
        message: 'No of Statements Policy Contain',
        default: 1,
        validate: value => !_.isNil(value) && value > 0
      }
    ]).then(async (answers) => {
      this.answers = answers;
      const { statementCount } = answers;
      for (let i = 0; i < statementCount; i += 1) {
        await this._statementPrompt(i + 1);  // eslint-disable-line
      }
      done();
    });
  }

  async configuring() {
    const schema = this._constructSchema();
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
