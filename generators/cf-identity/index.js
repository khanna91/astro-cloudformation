const Generator = require('yeoman-generator');
const chalk = require('chalk');
const _ = require('lodash');
const fs = require('fs');
const YAML = require('yaml');
const inquirer = require('inquirer');
const { listAllResources } = require('../helper');

module.exports = class extends Generator {
  constructor(args, opts) {
    super(args, opts);

    // Process argument
    this.props = {};

    console.log(chalk.blue('Setting up Cloudformation Origin Identity'));

    this.variableConfig = this.config.get('userDefinedVariables') || {};
  }

  async prompting() {
    const done = this.async();
    this.resources = await listAllResources(`./${this.config.get('baseFolder')}`);
    this.userVariables = Object.keys(this.variableConfig).map(val => `\${${val}}`);
    const that = this;
    inquirer
      .prompt([
        {
          type: 'input',
          name: 'resourceIdentifier',
          message: 'Specify AWS Resources Unique Identifier',
          validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
        },
        {
          type: 'input',
          name: 'comment',
          message: 'Comment',
          validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
        },
        {
          type: 'checkbox',
          name: 'resourceDependency',
          message: 'Is this resouce Dependent on any other resouce(s)',
          choices: this.resources,
          when: () => this.resources.length
        }
      ])
      .then((answers) => {
        that.props = answers;
        done();
      });
  }

  constructSchema() {
    const schema = {
      Type: 'AWS::CloudFront::CloudFrontOriginAccessIdentity',
      Properties: {
        CloudFrontOriginAccessIdentityConfig: {
          Comment: this.props.comment
        }
      }
    };
    if (!_.isEmpty(this.props.resourceDependency)) {
      schema.DependsOn = this.props.resourceDependency;
    }
    this.schema = schema;
  }

  async writing() {
    const fileName = `./${this.config.get('baseFolder')}/cf.yml`;
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
    if (!_.isNil(resYaml.Resources[this.props.resourceIdentifier])) {
      console.log(chalk.red('Error :: Duplicate Resource Identifier'));
      return;
    }
    resYaml.Resources[this.props.resourceIdentifier] = this.schema;
    try {
      fs.writeFileSync(fileName, YAML.stringify(resYaml));
    } catch (err) {
      console.log(chalk.red('Error :: Failed to save config'));
    }
  }
};
