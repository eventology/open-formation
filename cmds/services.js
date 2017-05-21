'use strict';

const _ = require('lodash');
const {Formation, AWSService} = require('../models');
const chalk = require('chalk');
const confirm = require('inquirer-confirm');

module.exports = (vorpal, print, formation) => {

  vorpal
    .command('services [cluster]')
    .description('List services for a cluser')
    .action(function (args) {
      return AWSService.load(args.cluster || formation.cluster)
        .then(services => {
          print(services, [{
            'name': 'clusterName',
            'colorize': true
          }, {
            'name': 'desiredCount',
            'colorize': true
          }, 'name', {
            'name': 'runningCount',
            'colorize': true
          }, {
            'name': 'status',
            'colorize': true
          }, {
            'name': 'pendingCount',
            'colorize': true
          }]);
        })
        .then(() => vorpal.show())
        .catch(err => {
          console.log(chalk.red('Uncaught error, aborting'), err);
          vorpal.show();
        });
    });

/**
 * Trigger a pull of the new docker image and a new download of credentials from
 * s3. Task settings will also be updated.
 **/
  vorpal
    .command('version <service>')
    .description('Create a new deployment version for a service and push the latest task configuration.')
    .action(function (args) {
      return formation.versionService(args.service)
        .then(() => vorpal.show())
        .catch(err => {
          console.log(chalk.red('Uncaught error, aborting'), err);
          vorpal.show();
        });
    });

  vorpal
    .command('delete <service>')
    .description('Create a new deployment version for a service and push the latest task configuration.')
    .action(function (args) {
      return AWSService.find(formation.cluster, {'name': args.service})
        .then(services => {
          if (services.length !== 1) throw new Error('Invalid number of services found');
          const service = _.head(services);
          return confirm(chalk.magenta(`Terminating service "${args.service}" in cluster "${formation.cluster}"`))
            .then(() => service.delete());
        });
    });

};
