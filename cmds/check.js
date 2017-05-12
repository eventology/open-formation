'use strict';

const {pwd} = require('../utils');
const path = require('path');
const _ = require('lodash');
const {Formation, AWSInstance} = require('../models');
const chalk = require('chalk');

module.exports = (vorpal, print) => {

  vorpal
    .command('check')
    .description('Check if your infrastructure is in place')
    .option('-t, --template <path>', `Template to check relative to cwd. Defaults to ./${process.env.DEFAULT_FORMATION}`)
    .action(function (args) {
      const template = path.join(pwd(), args.options.template || process.env.DEFAULT_FORMATION);
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

};
