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

    this.log(chalk.blue('Setting up AWS Security Group'));

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

  _constructBoundRule(type) {
    return this[type].map((rule) => {
      const ports = rule.port.split('-').map(val => parseInt(val.trim(), 10));
      return {
        IpProtocol: rule.protocol,
        FromPort: ports[0],
        ToPort: ports[1] || ports[0],
        CidrIp: rule.cidr,
        Description: rule.description
      };
    });
  }

  _constructSchema() {
    const schema = {
      Type: 'AWS::EC2::SecurityGroup'
    };
    const data = this.answers;
    const sgProperties = {
      GroupName: this._userVariableReplacer(data.name),
      GroupDescription: data.description,
      VpcId: this._userVariableReplacer(data.vpc),
      SecurityGroupEgress: this._constructBoundRule('egress'),
      SecurityGroupIngress: this._constructBoundRule('ingress'),
      Tags: '${file(./resources/tag.yml):Tags}', // eslint-disable-line
    };
    if (!_.isEmpty(data.resourceDependency)) {
      schema.DependsOn = data.resourceDependency;
    }
    schema.Properties = sgProperties;
    return schema;
  }

  async _promptConnections(type, index) {
    const name = type === 'ingress' ? 'Inbound' : 'Outbound';
    const answers = await this.prompt([
      {
        type: 'list',
        name: 'protocol',
        message: `${name} - ${index} Protocol`,
        choices: [
          { name: 'Custom TCP Rule', value: 'tcp' },
          { name: 'All traffic', value: -1 }
        ],
        validate: value => !_.isNil(value)
      },
      {
        type: 'input',
        name: 'port',
        message: `${name} - ${index} TCP Port Range (eg: 22 or 0 - 65535)`,
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'input',
        name: 'cidr',
        message: `${name} - ${index} CIDR`,
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'input',
        name: 'description',
        message: `${name} - ${index} Description`,
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      }
    ]);
    this[type].push(answers);
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
        name: 'name',
        message: 'Security Group Name',
        source: (answersSoFar, input) => new Promise(resolve => resolve(_.filter(userVariables, _variable => (
          (!_.isNil(_variable) && !_.isEmpty(input))
            ? _variable.toLowerCase().indexOf(input.toLowerCase()) >= 0
            : true)))),
        suggestOnly: true,
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'input',
        name: 'description',
        message: 'Security Group Description'
      },
      {
        type: 'autocomplete',
        name: 'vpc',
        message: 'Security Group VPC',
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
        name: 'inboundRule',
        message: 'No of Inbound Rules',
        default: 1,
        validate: value => !_.isNil(value) && value > 0
      },
      {
        type: 'number',
        name: 'outboundRule',
        message: 'No of Outbound Rules',
        default: 1,
        validate: value => !_.isNil(value) && value > 0
      }
    ]).then(async (answers) => {
      this.answers = answers;
      const { inboundRule, outboundRule } = answers;
      for (let i = 0; i < inboundRule; i += 1) {
        await this._promptConnections('ingress', i + 1);  // eslint-disable-line
      }
      for (let i = 0; i < outboundRule; i += 1) {
        await this._promptConnections('egress', i + 1);  // eslint-disable-line
      }
      done();
    });
  }

  async configuring() {
    const schema = this._constructSchema();
    const fileName = `./${this.config.get('baseFolder')}/sg.yml`;
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
