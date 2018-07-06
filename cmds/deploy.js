'use strict';

const _ = require('lodash');
const {Formation, AWSInstance} = require('../models');
const chalk = require('chalk');

module.exports = (vorpal, print, formation) => {

  vorpal
    .command('deploy')
    .description('Deploy the current formation')
    .option('-y, --yes', `Assume yes for deployment prompts`)
    .action(function (args) {
      return formation.instances()
        .then(instances => {
          const newMachines = _.filter(formation.machines, machine => !instances[machine.name]);
          console.log(chalk.magenta(`Deploying ${newMachines.length} instances`));
          print(newMachines, ['name', {
            'name': 'type',
            'colorize': true
          }, {
            'name': 'region',
            'colorize': true
          }]);
          return args.options.yes ? {'continue': true} : this.prompt({
            'type': 'confirm',
            'name': 'continue',
            'default': false,
            'message': `Continue?`
          });
        })
        .then(result => {
          if (!result.continue) return this.log('Deployment aborted.');
          this.log(`Deploying instances...`);
          return formation.createInstances();
        })
        .then(() => formation.instances())
        .then(instances => {
          console.log(chalk.magenta(`Successfully deployed ${_.keys(instances).length} instances`));
          print(_.values(instances), ['id', 'name', 'ip', 'type', 'region']);
          return instances;
        })
        .then(() => vorpal.show())
        .catch(err => {
          console.log(chalk.red('Uncaught error, aborting'), err);
          vorpal.show();
        });
    });

};
