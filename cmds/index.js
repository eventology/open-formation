'use strict';

const {cmd, pwd} = require('../utils');
const fs = require('fs');
const _ = require('lodash');
const path = require('path');
const {TestInstance, AWSInstance, Formation} = require('../models')();
const chalk = require('chalk');
const {clearScreen} = require('ansi-escapes');
const prettyjson = require('prettyjson');

const DEFAULT_FORMATION = 'formation.json';

module.exports = vorpal => {

  vorpal
    .command('clear')
    .description('Clear the screen')
    .action(function (args) {
      process.stdout.write(clearScreen);
      return Promise.resolve();
    });

  vorpal
    .command('lint')
    .description('Lint an open formation template')
    .option('-t, --template <path>', `Template to lint relative to cwd. Defaults to ./${DEFAULT_FORMATION}`)
    .action(function (args) {
      const template = path.join(pwd(), args.options.template || DEFAULT_FORMATION);
      return AWSInstance.imageIdByName('ubuntu/images/hvm-ssd/ubuntu-xenial-16.04-amd64-server-20170414')
        .then(() => Formation.load(template))
      // return parseTemplate(template)
        .then(formation => {
          console.log(chalk.magenta(`Found ${formation.machines.length} instances`));
          print(formation.machines, ['name', 'type', 'region']);
        });
    });

  vorpal
    .command('check')
    .description('Check if your infrastructure is in place')
    .option('-t, --template <path>', `Template to check relative to cwd. Defaults to ./${DEFAULT_FORMATION}`)
    .action(function (args) {
      const template = path.join(pwd(), args.options.template || DEFAULT_FORMATION);
      return Promise.all([
        Formation.load(template),
        AWSInstance.find()
      ])
        .then(results => {
          const {machines} = results[0];
          const instances = results[1];
          const matchedInstances = _.chain(machines)
            .map(machine => {
              return _.filter(instances, instance => {
                return instance.name === machine.name &&
                  instance.state !== 'terminated';
              });
            })
            .flatten()
            .value();
          print(matchedInstances, ['id', 'state', 'type', 'region']);
        });
    });

  vorpal
    .command('deploy')
    .description('Deploy an open formation template')
    .option('-t, --template <path>', `Template to deploy relative to cwd. Defaults to ./${DEFAULT_FORMATION}`)
    .action(function (args) {
      const template = path.join(pwd(), args.options.template || DEFAULT_FORMATION);
      return Formation.load(template)
        .then(formation => {
          console.log(chalk.magenta(`Deploying ${formation.machines.length} instances`));
          print(formation.machines, ['name', 'type', 'region', 'keyName']);
          return this.prompt({
            'type': 'confirm',
            'name': 'continue',
            'default': false,
            'message': `Continue?`
          }).then(result => {
            if (!result.continue) return this.log('Deployment aborted.');
            this.log(`Deploying instances...`);
            return formation.deploy()
              .then(() => formation.boot());
          });
        })
        .then(() => {
          // console.log(created);
          vorpal.show();
        })
        .catch(err => {
          console.log(chalk.red('Uncaught error'));
          console.log(err);
          vorpal.show();
        });
    });


  vorpal
    .command('start <instanceId>')
    .description('Start a stopped instance by id')
    .action(function (args) {
      return AWSInstance.byId(args.instanceId)
        .then(instance => instance.start());
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
            return instance.state !== 'terminated';
          });
          print(instances, ['id', {
            'name': 'state',
            'transform': state => {
              const stateColors = {
                'running': 'green',
                'stopped': 'blue',
                'shutting-down': 'red'
              };
              const color = stateColors[state];
              if (!color) return state;
              return chalk[color](state);
            }
          }, 'type', 'name', 'region', 'ip']);
        });
    });

  vorpal
    .command('test')
    .description('Test command')
    .action(function (args) {
      return TestInstance.load().log();
    });
};

function print(data, _options) {
  const options = _.chain([_options])
    .flatten()
    .map(opt => _.isString(opt) ? {'name': opt} : opt)
    .map(opt => _.defaults(opt, {
      'transform': i => `${i}`
    }))
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
    .map(row => _.map(options, opt => opt.transform(row[opt.name])))
    .map(stringRow => _.join(stringRow, ' '))
    .join('\n');
  console.log(bodyString);
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
