'use strict';

const _ = require('lodash');
const {Formation, AWSService, AWSTask} = require('../models');
const chalk = require('chalk');

module.exports = (vorpal, print, formation) => {

/**
 * Trigger a pull of the new docker image and a new download of credentials from
 * s3. Task settings will also be updated.
 **/
  vorpal
    .command('version <service>')
    .description('Create a new deployment version for a service and push the latest task configuration.')
    .action(function (args) {
      return AWSService.find(formation.cluster, {'name': args.service})
        .then(services => {
          if (services.length === 0) throw new Error(`Could not find service name ${args.service}`);
          if (services.length !== 1) throw new Error('Invalid number of services found');
          const service = _.head(services);
          return formation.registerTaskName(service.name)
            .then(taskDef => service.update({
              'taskDefinition': taskDef.arn
            }));
        })
        .then(() => vorpal.show())
        .catch(err => {
          console.log(chalk.red('Uncaught error, aborting'), err);
          vorpal.show();
        });
    });

};
