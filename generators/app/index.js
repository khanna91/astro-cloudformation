const Generator = require('yeoman-generator');
const chalk = require('chalk');
const clear = require('clear');
const inquirer = require('inquirer');
const mkdirp = require('mkdirp');
const _ = require('lodash');
const fs = require('fs');
const YAML = require('yaml');

module.exports = class extends Generator {
  constructor(args, opts) {
    super(args, opts);

    // Process argument
    this.props = {};

    clear();
    console.log(chalk.blue('Setting up Cloudformation schema directory'));
  }

  prompting() {
    const done = this.async();
    const that = this;
    inquirer
      .prompt([
        {
          type: 'input',
          name: 'project',
          message: 'What is Project Name?',
          default: 'resources',
          validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
        },
        {
          type: 'input',
          name: 'baseFolder',
          message: 'What is your resources folder?',
          default: 'resources',
          validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
        }
      ])
      .then((answers) => {
        that.props = answers;
        done();
      });
  }

  configuring() {
    const { props } = this;
    const dir = mkdirp.sync(`./${props.baseFolder}`);
    if (_.isEmpty(dir)) {
      console.log(chalk.red(`Error :: ${props.baseFolder} - Directory already exist`));
      return;
    }
    console.log(chalk.green('Project is setup to have resources schema'));
    this.config.set('baseFolder', props.baseFolder);
    this.config.save();

    const Tags = [{ Key: 'project', Value: props.project }];
    try {
      const fileName = `${dir}/tag.yml`;
      fs.writeFileSync(fileName, YAML.stringify({ Tags }));
    } catch (err) {
      console.log(chalk.red('Error :: Failed to create tags'));
    }
  }
};
