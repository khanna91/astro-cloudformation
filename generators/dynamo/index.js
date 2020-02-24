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
    this.attributes = [];
    this.keys = [];

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
      Type: 'AWS::DynamoDB::Table'
    };
    const data = this.answers;
    const Properties = {
      AttributeDefinitions: this.attributes.map(attr => ({
        AttributeName: attr.name,
        AttributeType: attr.type
      })),
      KeySchema: this.keys.map(attr => ({
        AttributeName: attr.name,
        KeyType: attr.type
      })),
      TableName: this._userVariableReplacer(data.tableName),
      Tags: '${file(./resources/tag.yml):Tags}', // eslint-disable-line
    };
    if (data.billingMode === 'PROVISIONED') {
      Properties.ProvisionedThroughput = {
        ReadCapacityUnits: data.readCapacity,
        WriteCapacityUnits: data.writeCapacity
      };
    }
    if (!_.isEmpty(data.resourceDependency)) {
      schema.DependsOn = data.resourceDependency;
    }
    schema.Properties = _(Properties).toPairs().sortBy(0).fromPairs();
    return schema;
  }

  async _secondaryPrompt(index, type) {
    const name = type === 'attributes' ? 'Attribute' : 'Key';
    const answer = await this.prompt([
      {
        type: 'input',
        name: 'name',
        message: `${name} - ${index} Name`,
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'list',
        name: 'type',
        message: `${name} - ${index} Type`,
        choices: [
          { name: 'String', value: 'S' },
          { name: 'Number', value: 'N' },
          { name: 'Binary', value: 'B' }
        ],
        when: () => type === 'attributes'
      },
      {
        type: 'list',
        name: 'type',
        message: `${name} - ${index} Type`,
        choices: [
          { name: 'Hash', value: 'HASH' },
          { name: 'Range', value: 'RANGE' }
        ],
        when: () => type === 'keys'
      }
    ]);
    this[type].push(answer);
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
        name: 'tableName',
        message: 'Table name',
        source: (answersSoFar, input) => new Promise(resolve => resolve(_.filter(userVariables, _variable => (
          (!_.isNil(_variable) && !_.isEmpty(input))
            ? _variable.toLowerCase().indexOf(input.toLowerCase()) >= 0
            : true)))),
        suggestOnly: true,
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'list',
        name: 'billingMode',
        message: 'Billing Mode',
        choices: [
          { name: 'PROVISIONED', value: 'PROVISIONED' },
          { name: 'On Demand', value: 'PAY_PER_REQUEST' }
        ],
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'number',
        name: 'readCapacity',
        message: 'Read Capacity',
        default: 5,
        validate: value => !_.isNil(value) && value > 0,
        when: answers => answers.billingMode === 'PROVISIONED'
      },
      {
        type: 'number',
        name: 'writeCapacity',
        message: 'Write Capacity',
        default: 5,
        validate: value => !_.isNil(value) && value > 0,
        when: answers => answers.billingMode === 'PROVISIONED'
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
        name: 'attributeCount',
        message: 'Total no. of Attributes',
        default: 1,
        validate: value => !_.isNil(value) && value > 0
      },
      {
        type: 'number',
        name: 'keyCount',
        message: 'Total no. of Key Schema',
        default: 1,
        validate: value => !_.isNil(value) && value > 0
      }
    ]).then(async (answers) => {
      this.answers = answers;
      const { attributeCount, keyCount } = answers;
      for (let i = 0; i < attributeCount; i += 1) {
        await this._secondaryPrompt(i + 1, 'attributes');  // eslint-disable-line
      }
      for (let i = 0; i < keyCount; i += 1) {
        await this._secondaryPrompt(i + 1, 'keys');  // eslint-disable-line
      }
      done();
    });
  }

  async configuring() {
    const schema = this._constructSchema();
    const fileName = `./${this.config.get('baseFolder')}/dynamo.yml`;
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
