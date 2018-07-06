'use strict';

const _ = require('lodash');
const {Formation, AWSInstance} = require('../models');
const chalk = require('chalk');
const confirm = require('inquirer-confirm');

module.exports = (vorpal, print, formation) => {

  vorpal
    .command('run <script> [machines...]')
    .description('Run a script on a machine. Omit machine name to run on all.')
    .option('-y, --yes', `Assume yes for prompts`)
    .action(function (args) {
      const script = args.script;
      let names = args.machines || [];
      return formation.instances()
        .then(instances => {
          const runInstances = _.chain(instances)
            .values()
            .filter(instance => {
              // Run on all formation instances
              if (!names.length) return true;
              // Or just the specified ones
              return names.indexOf(instance.name) !== -1;
            })
            .value();
          print(runInstances, ['id', 'name', {
            'name': 'type',
            'colorize': true
          }, {
            'name': 'region',
            'colorize': true
          }, 'ip']);
          names = _.map(runInstances, 'name');
          return confirm(chalk.magenta(`Running "${script}" on ${runInstances.length} instances`));
        })
        .then(() => formation.run(script, names))
        .then(arg => {
          console.log(arg);
          return arg;
        })
        .then(() => vorpal.show())
        .catch(err => {
          console.log(chalk.red('Aborting'), err);
          vorpal.show();
        });
    });

};
