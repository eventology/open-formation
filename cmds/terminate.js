'use strict';

const _ = require('lodash');
const chalk = require('chalk');
const {AWSInstance} = require('../models');
const confirm = require('inquirer-confirm');

module.exports = (vorpal, print, formation) => {

  vorpal
    .command('terminate')
    .description('Terminate machines in the current formation')
    .option('-y, --yes', `Assume yes for deployment prompts`)
    .action(function (args) {
      return formation.instances()
        .then(instances => {
          print(_.values(instances), ['id', 'name', {
            'name': 'type',
            'colorize': true
          }, {
            'name': 'region',
            'colorize': true
          }]);
          return confirm(chalk.magenta(`Terminating ${_.keys(instances).length} instances`))
            .then(() => instances);
        })
        .then(instances => {
          if (!instances) throw new Error('User terminated');
          return Promise.all(_.invokeMap(instances, 'terminate'));
        })
        .then(() => vorpal.show())
        .catch(err => {
          console.log(chalk.red('Aborting'), err);
          vorpal.show();
        });
    });

};
