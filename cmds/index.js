'use strict';

const {cmd, pwd} = require('../utils');
const fs = require('fs');
const _ = require('lodash');
const path = require('path');
const {AWSInstance} = require('../models')();
const chalk = require('chalk');

module.exports = vorpal => {

  vorpal
    .command('lint')
    .description('Lint an open formation template')
    .option('-t, --template <path>', 'Template to lint relative to cwd. Defaults to ./of.json')
    .action(function (args) {
      const template = path.join(pwd(), args.options.template || 'of.json');
      return AWSInstance.imageIdByName('ubuntu/images/hvm-ssd/ubuntu-xenial-16.04-amd64-server-20170414')
        .then(() => parseMachines(template))
      // return parseMachines(template)
        .then(machines => {
          console.log(chalk.magenta(`Found ${machines.length} instances`));
          print(machines, ['name', 'type', 'region']);
        });
    });

  vorpal
    .command('deploy')
    .description('Deploy an open formation template')
    .option('-t, --template <path>', 'Template to deploy relative to cwd. Defaults to ./of.json')
    .action(function (args) {
      const template = path.join(pwd(), args.options.template || 'of.json');
      let machines;
      return parseMachines(template)
        .then(_machines => {
          machines = _machines;
          console.log(chalk.magenta(`Deploying ${machines.length} instances`));
          print(machines, ['name', 'type', 'region']);
          return this.prompt({
            'type': 'confirm',
            'name': 'continue',
            'default': false,
            'message': `Continue?`
          });
        })
        .then(result => {
          if (!result.continue) return this.log('Deployment aborted.');
          this.log(`Deploying instances...`);
          const imageIdsByRegion = {};
          const createdInstances = [];
          const promises = _.map(machines, machine => {
            return AWSInstance.create(machine)
              .then(instance => {
                createdInstances.push(instance);
                console.log(chalk.blue(`Instance ${createdInstances.length} of ${machines.length} deployed.`));
                return instance;
              })
              .catch(err => {
                console.log(`Error creating machine ${JSON.stringify(machine)}`);
              });
          });
          return Promise.all(promises);
        })
        .then(created => {
          this.log(created);
          vorpal.show();
        });
    });


  vorpal
    .command('rm <instanceId>')
    .description('Terminate an instance by id')
    .action(function (args) {
      let instance;
      return AWSInstance.byId(args.instanceId)
        .then(_instance => {
          instance = _instance;
          this.log(instance);
          return this.prompt({
            'type': 'confirm',
            'name': 'continue',
            'default': false,
            'message': `Terminate this instance?`
          });
        })
        .then(result => {
          if (!result.continue) return this.log('Termination aborted.');
          this.log('Terminating instance...');
          return instance.terminate();
        })
        .then(() => vorpal.show());
    });

  vorpal
    .command('ls')
    .description('List your running instances. Excludes terminated machines.')
    .action(function (args) {
      return AWSInstance.find()
        .then(_instances => {
          const instances = _.filter(_instances, instance => {
            return chalk.stripColor(instance.state) !== 'terminated';
          });
          print(instances, ['id', {
            'name': 'state',
            'fn': state => {
              return _.get({
                'running': chalk.green,
                'stopped': chalk.blue,
                'shutting-down': chalk.yellow,
                'terminated': chalk.red
              }, state, i => i)(state);
            }
          }, 'type', 'name', 'region', 'ip']);
        });
    });

};

function print(data, _options) {
  const options = _.chain([_options])
    .flatten()
    .map(opt => _.isString(opt) ? {'name': opt} : opt)
    .value();

  const rows = _.chain([data])
    .flatten()
    .compact()
    .map(obj => _.pick(obj, _.map(options, 'name')))
    .value();

  // Calculate the max length for each column in the table
  const columnLengths = _.reduce(options, (lengths, option) => {
    const name = option.name;
    let length = name.length;
    _.forEach(rows, row => {
      const newLength = `${row[name]}`.length;
      length = newLength > length ? newLength : length;
    });
    lengths[name] = length;
    return lengths;
  }, {});

  // Generate the header based on keys
  const header = _(options)
    .map(opt => _.padEnd(opt.name, columnLengths[opt.name]))
    .join(' ');
  console.log(chalk.cyan(header));

  // Generate the table body based on row content
  const bodyString = _(rows)
    // Add padding for each row
    .map(row => _.mapValues(row, (value, key) => _.padEnd(value, columnLengths[key])))
    // Map values into strings
    .map(row => _.map(options, opt => {
      if (_.isFunction(opt.fn)) {
        return opt.fn(row[opt.name]);
      }
      return row[opt.name];
    }))
    .map(stringRow => _.join(stringRow, ' '))
    .join('\n');
  console.log(bodyString);
}

function parseMachines(templatePath) {
  return new Promise((rs, rj) => fs.readFile(templatePath, (err, data) => {
    if (err) rj(err);
    else rs(data.toString());
  }))
    .then(JSON.parse)
    .then(template => {
      const configKey = '__config__';
      const config = template[configKey] || {
        'type': 't2.micro',
        'region': 'us-east-1'
      };
      delete template[configKey];
      return _.chain(template)
        .map((_machines, name) => {
          const machines = _.flatten([_machines]);
          return _.map(machines, (options, index) => {
            return _.assign(_.clone(config), {
              'name': `${name}${machines.length > 1 ? index : ''}`
            }, options);
          });
        })
        .flatten()
        .value();
    });
}
// module.exports = vorpal => {
//   const files = fs.readDirSync(__dirname);
//   const jsRegex = /^(?!index)[a-z\-]\.js$/;
//   _.forEach(files, filename => {
//     const filepath = path.join(__dirname, filename);
//     if (!jsRegex.test(filepath)) return;
//     require(filepath)(vorpal);
//   });
// };
