const Generator = require('yeoman-generator');
const _ = require('lodash');
const chalk = require('chalk');

module.exports = class extends Generator {
  constructor(args, opts) {
    super(args, opts);

    // Process argument
    this.props = {};
    this.variableConfig = this.config.get('userDefinedVariables') || {};
  }

  async prompting() {
    const userDefinedVariables = Object.keys(this.variableConfig);
    const mainOptions = ['CREATE'];
    const dependentOption = ['LIST', 'GET', 'UPDATE', 'DELETE'];
    if (!_.isEmpty(userDefinedVariables)) {
      mainOptions.push(...dependentOption);
    }
    this.answers = await this.prompt([
      {
        type: 'list',
        name: 'mainOption',
        message: 'Manage Variables',
        choices: mainOptions,
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'list',
        name: 'variableName',
        message: 'Choose Variable',
        choices: userDefinedVariables,
        when: answers => ['GET', 'UPDATE', 'DELETE'].includes(answers.mainOption),
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'input',
        name: 'variableName',
        message: 'Enter Variable Name',
        when: answers => answers.mainOption === 'CREATE',
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'input',
        name: 'variableValue',
        message: 'Enter Variable Value',
        when: answers => ['CREATE', 'UPDATE'].includes(answers.mainOption),
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      }
    ]);
  }

  configuring() {
    const { mainOption, variableName, variableValue } = this.answers;
    if (mainOption === 'CREATE') {
      this.variableConfig[variableName] = variableValue;
      this.config.set('userDefinedVariables', this.variableConfig);
    } else if (mainOption === 'GET') {
      console.log(
        chalk.white(
          'Variable Value',
          chalk.underline.green(this.variableConfig[variableName])
        )
      );
    } else if (mainOption === 'UPDATE') {
      this.variableConfig[variableName] = variableValue;
      this.config.set('userDefinedVariables', this.variableConfig);
    } else if (mainOption === 'DELETE') {
      delete this.variableConfig[variableName];
      this.config.set('userDefinedVariables', this.variableConfig);
    } else if (mainOption === 'LIST') {
      console.log(Object.keys(this.variableConfig));
    }
  }

  writing() {
    this.config.save();
  }
};
