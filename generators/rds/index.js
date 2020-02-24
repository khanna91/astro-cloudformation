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
    this.ingress = [];
    this.egress = [];

    this.log(chalk.blue('Setting up AWS RDS'));

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
      Type: 'AWS::EC2::DBInstance'
    };
    const data = this.answers;
    const Properties = {
      AllocatedStorage: 20,
      AllowMajorVersionUpgrade: false,
      AutoMinorVersionUpgrade: true,
      AvailabilityZone: data.availability,
      BackupRetentionPeriod: 7,
      DBInstanceClass: `db.${data.type}.${data.size}`,
      DBInstanceIdentifier: this._userVariableReplacer(data.dbIdentifier),
      DBName: this._userVariableReplacer(data.dbName),
      DeleteAutomatedBackups: false,
      DeletionProtection: false,
      Engine: data.engine,
      EngineVersion: data.engine === 'mysql' ? '5.7.22' : '14.00.3223.3.v1',
      MasterUsername: this._userVariableReplacer(data.username),
      MasterUserPassword: this._userVariableReplacer(data.password),
      MaxAllocatedStorage: 1000,
      MultiAZ: false,
      Port: data.engine === 'mysql' ? 3306 : 1433,
      PubliclyAccessible: false,
      StorageEncrypted: true,
      StorageType: 'gp2',
      EnablePerformanceInsights: true,
      VPCSecurityGroups: [data.vpcsg],
      Tags: '${file(./resources/tag.yml):Tags}', // eslint-disable-line
    };
    if (!_.isEmpty(data.resourceDependency)) {
      schema.DependsOn = data.resourceDependency;
    }
    schema.Properties = Properties;
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
        type: 'list',
        name: 'engine',
        message: 'RDS Engine Type',
        choices: [
          { name: 'My Sql', value: 'mysql' },
          { name: 'Microsoft Sql Server', value: 'sqlserver-ex' }
        ],
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'list',
        name: 'type',
        message: 'RDS Instanse Type',
        choices: [
          { name: 'T3', value: 't3' },
          { name: 'T2', value: 't2' },
          { name: 'M5', value: 'm4' },
          { name: 'M4', value: 'm4' },
          { name: 'R5', value: 'r5' },
          { name: 'R4', value: 'r4' }
        ],
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'list',
        name: 'size',
        message: 'RDS Instanse Size',
        choices: [
          'micro', 'small', 'medium', 'large', 'xlarge'
        ],
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'list',
        name: 'availability',
        message: 'RDS Instanse Size',
        choices: [
          new inquirer.Separator('Asia Pacific (Singapore)'), 'ap-southeast-1a', 'ap-southeast-1b', 'ap-southeast-1c',
          new inquirer.Separator('Asia Pacific (Mumbai)'), 'ap-south-1a', 'ap-south-1b', 'ap-south-1c',
          new inquirer.Separator('US East (N.Virginia)'), 'us-east-1a', 'us-east-1b', 'us-east-1c', 'us-east-1d', 'us-east-1e', 'us-east-1f'
        ],
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'autocomplete',
        name: 'dbIdentifier',
        message: 'DB Instance Identifier',
        source: (answersSoFar, input) => new Promise(resolve => resolve(_.filter(userVariables, _variable => (
          (!_.isNil(_variable) && !_.isEmpty(input))
            ? _variable.toLowerCase().indexOf(input.toLowerCase()) >= 0
            : true)))),
        suggestOnly: true,
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'autocomplete',
        name: 'dbName',
        message: 'DB Name',
        source: (answersSoFar, input) => new Promise(resolve => resolve(_.filter(userVariables, _variable => (
          (!_.isNil(_variable) && !_.isEmpty(input))
            ? _variable.toLowerCase().indexOf(input.toLowerCase()) >= 0
            : true)))),
        suggestOnly: true,
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'autocomplete',
        name: 'vpcsg',
        message: 'VPC Security Group',
        source: (answersSoFar, input) => new Promise(resolve => resolve(_.filter(userVariables, _variable => (
          (!_.isNil(_variable) && !_.isEmpty(input))
            ? _variable.toLowerCase().indexOf(input.toLowerCase()) >= 0
            : true)))),
        suggestOnly: true,
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'autocomplete',
        name: 'username',
        message: 'Master Username',
        source: (answersSoFar, input) => new Promise(resolve => resolve(_.filter(userVariables, _variable => (
          (!_.isNil(_variable) && !_.isEmpty(input))
            ? _variable.toLowerCase().indexOf(input.toLowerCase()) >= 0
            : true)))),
        suggestOnly: true,
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'autocomplete',
        name: 'password',
        message: 'Master Password',
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
      }
    ]).then(async (answers) => {
      this.answers = answers;
      done();
    });
  }

  async configuring() {
    const schema = this._constructSchema();
    const fileName = `./${this.config.get('baseFolder')}/rds.yml`;
    let resYaml;
    let file;
    try {
      file = fs.readFileSync(fileName, 'utf8');
      resYaml = YAML.parse(file);
      if (_.isNil(resYaml.Resources)) {
        resYaml = { Resources: {} };
      }
    } catch (err) {
      resYaml = { Resources: {} };
    }
    if (!_.isNil(resYaml.Resources[this.answers.resourceIdentifier])) {
      console.log(chalk.red('Error :: Duplicate Resource Identifier'));
      return;
    }
    resYaml.Resources[this.answers.resourceIdentifier] = schema;
    try {
      fs.writeFileSync(fileName, YAML.stringify(resYaml));
    } catch (err) {
      console.log(chalk.red('Error :: Failed to save config'));
    }
  }
};
