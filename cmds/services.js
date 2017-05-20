'use strict';

const _ = require('lodash');
const {Formation, AWSService} = require('../models');
const chalk = require('chalk');

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

};
