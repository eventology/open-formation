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
    .action(function (args) {
      const template = path.join(pwd(), args.options.template || process.env.DEFAULT_FORMATION);
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
              .then(() => formation.boot())
              .then(() => print(formation.instances, ['id', 'name', 'ip', 'type']));
          });
        })
        .then(() => {
          vorpal.show();
        })
        .catch(err => {
          console.log(chalk.red('Uncaught error'));
          console.log(err);
          vorpal.show();
        });
    });

};
