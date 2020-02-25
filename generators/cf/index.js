const Generator = require('yeoman-generator');
const chalk = require('chalk');
const _ = require('lodash');
const fs = require('fs');
const YAML = require('yaml');
const inquirer = require('inquirer');
const { listAllResources, listCloudfrontIdentity } = require('../helper');

inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'));

module.exports = class extends Generator {
  constructor(args, opts) {
    super(args, opts);

    // Process argument
    this.props = {};
    this.cacheBehaviour = [];
    this.origins = [];
    this.FieldLevelEncryptionId = '';

    this.log(chalk.blue('Setting up AWS CloudFront Resources'));

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

  _refIdentityReplacer(originalString) {
    const that = this;
    const regex = /^!Ref/;
    if (originalString.match(regex)) {
      return {
        'Fn::Join': ['', ['origin-access-identity/cloudfront/', { Ref: originalString.replace(regex, '') }]]
      };
    }
    return originalString;
  }

  _setCacheBehaviour(behaviour, target) {
    const cacheBehaviour = {
      FieldLevelEncryptionId: this.FieldLevelEncryptionId,
      TargetOriginId: target,
      ViewerProtocolPolicy: behaviour.viewerProtocolPolicy,
      SmoothStreaming: behaviour.smoothStreaming,
      Compress: behaviour.compress,
      MinTTL: behaviour.minimumTtl,
      DefaultTTL: behaviour.defaultTtl,
      MaxTTL: behaviour.minimumTtl,
      CachedMethods: ['GET', 'HEAD'],
      AllowedMethods: ['GET', 'HEAD']
    };
    if (behaviour.pathPattern) {
      cacheBehaviour.PathPattern = behaviour.pathPattern;
    }
    if (behaviour.cachedOptionMethod) {
      cacheBehaviour.CachedMethods.push('OPTIONS');
    }
    if (behaviour.allowedMethods === 2) {
      cacheBehaviour.AllowedMethods.push('OPTIONS');
    } else if (behaviour.allowedMethods === 3) {
      cacheBehaviour.AllowedMethods.push(...['OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE']);
    }
    const ForwardedValues = {
      Cookies: {
        Forward: behaviour.forwardCookies
      },
      QueryString: behaviour.forwardQueryString !== 'none'
    };
    if (behaviour.forwardCookies === 'whitelist') {
      ForwardedValues.Cookies.WhitelistedNames = behaviour.whitelistCookies.split(',').map(val => val.trim());
    }
    if (behaviour.forwardQueryString === 'whitelist') {
      ForwardedValues.QueryStringCacheKeys = behaviour.whitelistQuery.split(',').map(val => val.trim());
    }
    if (behaviour.forwardHeader === 'whitelist') {
      ForwardedValues.Headers = behaviour.whitelistHeader.split(',').map(val => val.trim());
    }
    cacheBehaviour.ForwardedValues = ForwardedValues;
    return cacheBehaviour;
  }

  async _askCacheBehaviour(defaultCache) {
    const behaviour = await this.prompt([
      {
        type: 'input',
        name: 'pathPattern',
        message: 'Path Pattern',
        when: () => !defaultCache,
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'list',
        name: 'viewerProtocolPolicy',
        message: 'Viewer Protocol Policy',
        choices: [
          { name: 'HTTP and HTTPS', value: 'allow-all' },
          { name: 'Redirect HTTP to HTTPS', value: 'redirect-to-https' },
          { name: 'HTTPS Only', value: 'https-only' }
        ],
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'list',
        name: 'allowedMethods',
        message: 'Allowed HTTP Methods',
        choices: [
          { name: 'GET, HEAD', value: 1 },
          { name: 'GET, HEAD, OPTIONS', value: 2 },
          { name: 'GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE', value: 3 }
        ],
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'confirm',
        name: 'cachedOptionMethod',
        message: 'Cached HTTP `OPTIONS` Methods'
      },
      {
        type: 'number',
        name: 'minimumTtl',
        message: 'Minimum TTL',
        default: 0,
        validate: value => !_.isNil(value)
      },
      {
        type: 'number',
        name: 'maximumTtl',
        message: 'Maximum TTL',
        default: 31536000,
        validate: value => !_.isNil(value)
      },
      {
        type: 'number',
        name: 'defaultTtl',
        message: 'Default TTL',
        default: 86400,
        validate: value => !_.isNil(value)
      },
      {
        type: 'list',
        name: 'forwardCookies',
        message: 'Forward Cookies',
        choices: [
          { name: 'None', value: 'none' },
          { name: 'Whitelist', value: 'whitelist' },
          { name: 'All', value: 'all' }
        ],
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'input',
        name: 'whitelistCookies',
        message: 'Mention Whitelist Cookies (comma seperated)',
        when: answers => answers.forwardCookies === 'whitelist',
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'list',
        name: 'forwardQueryString',
        message: 'Query String Forwarding and Caching',
        choices: [
          { name: 'None', value: 'none' },
          { name: 'Whitelist', value: 'whitelist' },
          { name: 'All', value: 'all' }
        ],
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'input',
        name: 'whitelistQuery',
        message: 'Mention Whitelist Querystrings (comma seperated)',
        when: answers => answers.forwardQueryString === 'whitelist',
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'list',
        name: 'forwardHeader',
        message: 'Cached Based on Headers?',
        choices: [
          { name: 'None', value: 'none' },
          { name: 'Whitelist', value: 'whitelist' }
        ],
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'input',
        name: 'whitelistHeader',
        message: 'Mention Whitelist Headers (comma seperated)',
        when: answers => answers.forwardHeader === 'whitelist',
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'confirm',
        name: 'smoothStreaming',
        message: 'Enable Smooth Streaming?'
      },
      // {
      //   type: 'confirm',
      //   name: 'restrictViewerAccess',
      //   message: 'Restrict Viewer Access (Use Signed URLs or Signed Cookies)?'
      // },
      {
        type: 'confirm',
        name: 'compress',
        message: 'Compress Objects Automatically?'
      }
    ]);
    return behaviour;
  }

  async _askOrigin(defaultOrigin) {
    const that = this;
    return new Promise((resolver) => {
      // const done = that.async();
      const { userVariables, originIdentities } = that;
      inquirer.prompt([
        {
          type: 'list',
          name: 'originType',
          message: 'Type of Origin?',
          choices: [
            { name: 'S3 Origin', value: 1 },
            { name: 'Custom Origin', value: 2 }
          ],
          validate: value => !_.isNil(value)
        },
        {
          type: 'autocomplete',
          name: 's3Bucket',
          message: 'S3 Bucket Name',
          source: (answersSoFar, input) => new Promise(resolve => resolve(_.filter(userVariables, _variable => (
            (!_.isNil(_variable) && !_.isEmpty(input))
              ? _variable.toLowerCase().indexOf(input.toLowerCase()) >= 0
              : true)))),
          suggestOnly: true,
          when: answers => answers.originType === 1,
          validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
        },
        {
          type: 'confirm',
          name: 'restrictBucket',
          message: 'Restrict Bucket Access?',
          when: answers => answers.originType === 1
        },
        {
          type: 'autocomplete',
          name: 'originIdentity',
          message: 'Origin Identities',
          source: (answersSoFar, input) => new Promise(resolve => resolve(_.filter(originIdentities, _variable => (
            (!_.isNil(_variable) && !_.isEmpty(input))
              ? _variable.toLowerCase().indexOf(input.toLowerCase()) >= 0
              : true)))),
          suggestOnly: true,
          when: answers => answers.originType === 1 && answers.restrictBucket,
          validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
        },
        {
          type: 'autocomplete',
          name: 'customDomain',
          message: 'Origin Domain',
          source: (answersSoFar, input) => new Promise(resolve => resolve(_.filter(userVariables, _variable => (
            (!_.isNil(_variable) && !_.isEmpty(input))
              ? _variable.toLowerCase().indexOf(input.toLowerCase()) >= 0
              : true)))),
          suggestOnly: true,
          when: answers => answers.originType === 2,
          validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
        },
        {
          type: 'input',
          name: 'originPath',
          message: 'Origin Path',
          when: answers => answers.originType === 2,
          validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
        }
      ]).then((answers) => {
        if (defaultOrigin) {
          that.defaultOrigin = answers;
        } else {
          that.origins.push(answers);
        }
        // done();
        resolver();
      });
    });
  }

  async configuring() {
    const done = this.async();
    this.resources = await listAllResources(`./${this.config.get('baseFolder')}`);
    this.userVariables = Object.keys(this.variableConfig).map(val => `\${${val}}`);
    this.originIdentities = await listCloudfrontIdentity(`./${this.config.get('baseFolder')}`);
    inquirer.prompt([
      {
        type: 'input',
        name: 'resourceIdentifier',
        message: 'Specify AWS Resources Unique Identifier',
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'checkbox',
        name: 'resourceDependency',
        message: 'Is this resouce Dependent on any other resouce(s)',
        choices: this.resources,
        when: () => this.resources.length
      }
    ]).then((answers) => {
      this.resourceIdentifier = answers.resourceIdentifier;
      this.resourceDependency = answers.resourceDependency;
      done();
    });
  }

  async defaultOriginPrompt() {
    this.log(chalk.blue('Setting up Default Origin'));
    await this._askOrigin(true);
  }

  promptMoreOrigins() {
    const done = this.async();
    inquirer.prompt([
      {
        type: 'confirm',
        name: 'moreOrigin',
        message: 'You want to add more origins other than default one?'
      },
      {
        type: 'input',
        name: 'originCount',
        message: 'How many more origins?',
        when: ans => ans.moreOrigin,
        validate: value => !_.isNil(value) && value > 0
      }
    ]).then(async (answers) => {
      if (answers.moreOrigin) {
        for (let i = 0; i < answers.originCount; i += 1) {
          await this._askOrigin(false); // eslint-disable-line        
        }
      }
      done();
    });
  }

  async defaultCachePrompt() {
    this.log(chalk.blue('Setting up Default Cache Behaviour'));
    this.defaultBehaviour = await this._askCacheBehaviour(true);
  }

  distributionSettingPrompt() {
    const done = this.async();
    const { userVariables } = this;
    inquirer.prompt([
      {
        type: 'list',
        name: 'priceClass',
        message: 'Price Class',
        choices: [
          { name: 'Use All Edge Locations (Best Performance)', value: 'PriceClass_All' },
          { name: 'Use only U.S., CANADA, and Europe', value: 'PriceClass_100' },
          { name: 'Use only U.S., CANADA, Europe, Asia, Middle East and Africa', value: 'PriceClass_200' }
        ],
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'autocomplete',
        name: 'cname',
        message: 'Alternate Domain Name (CNAMEs)',
        source: (answersSoFar, input) => new Promise(resolve => resolve(_.filter(userVariables, _variable => (
          (!_.isNil(_variable) && !_.isEmpty(input))
            ? _variable.toLowerCase().indexOf(input.toLowerCase()) >= 0
            : true)))),
        suggestOnly: true
      },
      {
        type: 'list',
        name: 'sslCert',
        message: 'SSL Certificate',
        choices: [
          { name: 'Default CloudFront Certificate (*.cloudfront.net)', value: 1 },
          { name: 'Custom SSL Certificate (example.com)', value: 2 }
        ],
        validate: value => !_.isNil(value)
      },
      {
        type: 'autocomplete',
        name: 'acmCert',
        message: 'ACM Certificate ARN',
        source: (answersSoFar, input) => new Promise(resolve => resolve(_.filter(userVariables, _variable => (
          (!_.isNil(_variable) && !_.isEmpty(input))
            ? _variable.toLowerCase().indexOf(input.toLowerCase()) >= 0
            : true)))),
        suggestOnly: true,
        when: answers => answers.sslCert === 2
      },
      {
        type: 'list',
        name: 'httpVersion',
        message: 'Supported HTTP Version',
        choices: [
          { name: 'HTTP/2, HTTP/1.1, HTTP/1.0', value: 'http2' },
          { name: 'HTTP/1.1, HTTP/1.0', value: 'http1.1' }
        ],
        validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
      },
      {
        type: 'input',
        name: 'defaultRoot',
        message: 'Default Root Object',
        default: 'index.html'
      },
      {
        type: 'confirm',
        name: 'enableIPV6',
        message: 'Enable IPv6'
      },
      {
        type: 'confirm',
        name: 'enableLogging',
        message: 'Enable Logging'
      },
      {
        type: 'autocomplete',
        name: 'logBucket',
        message: 'Bucket For Logs',
        source: (answersSoFar, input) => new Promise(resolve => resolve(_.filter(userVariables, _variable => (
          (!_.isNil(_variable) && !_.isEmpty(input))
            ? _variable.toLowerCase().indexOf(input.toLowerCase()) >= 0
            : true)))),
        suggestOnly: true,
        when: answers => answers.enableLogging,
        validate: value => !_.isNil(value) && !_.isEmpty(value)
      },
      {
        type: 'input',
        name: 'logPrefix',
        message: 'Log Prefix',
        when: answers => answers.enableLogging
      },
      {
        type: 'confirm',
        name: 'logCookieInclude',
        message: 'Cookie Logging',
        when: answers => answers.enableLogging
      },
      {
        type: 'autocomplete',
        name: 'comment',
        message: 'Comment',
        source: (answersSoFar, input) => new Promise(resolve => resolve(_.filter(userVariables, _variable => (
          (!_.isNil(_variable) && !_.isEmpty(input))
            ? _variable.toLowerCase().indexOf(input.toLowerCase()) >= 0
            : true)))),
        suggestOnly: true
      },
      {
        type: 'confirm',
        name: 'distributionState',
        message: 'Distribution Enabled'
      },
      {
        type: 'confirm',
        name: 'addMoreCacheBehaviour',
        message: 'Want to add more cache behaviours?'
      },
      {
        type: 'number',
        name: 'additionalCacheBehaviour',
        message: 'How Many?',
        when: answers => answers.addMoreCacheBehaviour
      }
    ]).then(async (distributionSettings) => {
      this.distributionSettings = distributionSettings;
      const _origins = [this.defaultOrigin, ...this.origins].map((origin) => {
        if (origin.originType === 1) {
          const bucketName = this._userVariableReplacer(origin.s3Bucket);
          return `S3-${bucketName}`;
        }
        const domainName = this._userVariableReplacer(origin.customDomain);
        return `Custom-${domainName}/${origin.originPath}`;
      });
      for (let i = 0; i < distributionSettings.additionalCacheBehaviour; i += 1) {
        this.log(chalk.blue(`Setting up Cache Behaviour${i + 1}`));
        const targetOrigin = await this.prompt([ // eslint-disable-line
          {
            type: 'list',
            name: 'targetOrigin',
            message: 'Origin',
            choices: _origins,
            validate: value => !_.isNil(value) && !_.isEmpty(value.trim())
          }
        ]);
        const cacheBehaviour = await this._askCacheBehaviour(false); // eslint-disable-line
        this.cacheBehaviour.push(Object.assign(targetOrigin, cacheBehaviour));
      }
      done();
    });
  }

  constructSchema() {
    const schema = {
      Type: 'AWS::CloudFront::Distribution'
    };
    const {
      defaultOrigin, cacheBehaviour, origins, defaultBehaviour, distributionSettings, resourceDependency
    } = this;
    if (!_.isEmpty(resourceDependency)) {
      schema.DependsOn = resourceDependency;
    }

    const DistributionConfig = {
      PriceClass: distributionSettings.priceClass,
      HttpVersion: distributionSettings.httpVersion,
      Enabled: distributionSettings.distributionState,
      Comment: this._userVariableReplacer(distributionSettings.comment),
      WebACLId: '',
      IPV6Enabled: distributionSettings.enableIPV6,
      Restrictions: {
        GeoRestriction: { RestrictionType: 'none' }
      },
      DefaultRootObject: distributionSettings.defaultRoot
    };
    if (!_.isEmpty(distributionSettings.cname)) {
      DistributionConfig.Aliases = [this._userVariableReplacer(distributionSettings.cname)];
    }
    if (distributionSettings.sslCert === 2) {
      DistributionConfig.ViewerCertificate = {
        AcmCertificateArn: this._userVariableReplacer(distributionSettings.acmCert),
        SslSupportMethod: 'sni-only',
        MinimumProtocolVersion: 'TLSv1.2_2018'
      };
    }
    DistributionConfig.Origins = [defaultOrigin, ...origins].map((_origin) => {
      let origin;
      if (_origin.originType === 1) {
        const bucketName = this._userVariableReplacer(_origin.s3Bucket);
        origin = {
          DomainName: `${bucketName}.s3.amazonaws.com`,
          Id: `S3-${bucketName}`
        };
        if (_origin.restrictBucket) {
          origin.S3OriginConfig = this._refIdentityReplacer(_origin.originIdentity);
        }
      } else {
        const domain = this._userVariableReplacer(_origin.customDomain);
        origin = {
          DomainName: domain,
          Id: `Custom-${domain}/${_origin.originPath}`,
          OriginPath: `/${_origin.originPath}`,
          CustomOriginConfig: {
            OriginSSLProtocols: ['TLSv1.2'],
            OriginProtocolPolicy: 'https-only',
            OriginReadTimeout: 30,
            HTTPPort: 80,
            HTTPSPort: 443,
            OriginKeepaliveTimeout: 5
          }
        };
      }
      return origin;
    });
    let defaultTarget;
    if (defaultOrigin.originType === 1) {
      defaultTarget = `S3-${this._userVariableReplacer(defaultOrigin.s3Bucket)}`;
    } else {
      defaultTarget = `Custom-${this._userVariableReplacer(defaultOrigin.customDomain)}/${defaultOrigin.originPath}`;
    }
    DistributionConfig.DefaultCacheBehavior = this._setCacheBehaviour(defaultBehaviour, defaultTarget);
    DistributionConfig.CacheBehaviors = cacheBehaviour.map(behaviour => this._setCacheBehaviour(behaviour, behaviour.targetOrigin));
    schema.Properties = {
      DistributionConfig: schema.Properties = _(DistributionConfig).toPairs().sortBy(0).fromPairs(),
      Tags: '${file(./resources/tag.yml):Tags}', // eslint-disable-line
    };

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
    if (!_.isNil(resYaml.Resources[this.resourceIdentifier])) {
      console.log(chalk.red('Error :: Duplicate Resource Identifier'));
      return;
    }
    resYaml.Resources[this.resourceIdentifier] = this.schema;
    try {
      fs.writeFileSync(fileName, YAML.stringify(resYaml));
    } catch (err) {
      console.log(chalk.red('Error :: Failed to save config'));
    }
  }
};
