'use strict';

const {pwd} = require('../utils');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const {Formation, AWSInstance} = require('../models');
const chalk = require('chalk');

module.exports = (vorpal, print) => {

  vorpal
    .command('deploy')
    .description('Deploy an open formation template')
    .option('-t, --template <path>', `Template to deploy relative to cwd. Defaults to ./${process.env.DEFAULT_FORMATION}`)
    .option('-y, --yes', `Assume yes for deployment prompts`)
    .action(function (args) {
      const template = path.join(pwd(), args.options.template || process.env.DEFAULT_FORMATION);
      let formation;
      return Formation.load(template)
        .then(_formation => {
          formation = _formation;
          console.log(chalk.magenta(`Deploying ${_.values(formation.machines).length} instances`));
          print(_.values(formation.machines), ['name', 'type', 'region', 'keyName']);
          if (args.options.yes) return {'continue': true};
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
          return formation.createInstances()
            .then(() => formation.instances())
            .log(instances => {
              console.log(chalk.magenta(`Successfully deployed ${_.keys(instances).length} instances`));
              print(_.values(instances), ['id', 'name', 'ip', 'type', 'region']);
            });
        })
        .then(() => vorpal.show())
        .catch(err => {
          console.log(chalk.red('Uncaught error, aborting'));
          vorpal.show();
          throw err;
        });
    });

};
