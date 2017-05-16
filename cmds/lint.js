'use strict';

const {AWSInstance, Formation} = require('../models');
const {pwd} = require('../utils');
const _ = require('lodash');
const path = require('path');
const chalk = require('chalk');

module.exports = (vorpal, print) => {

  vorpal
    .command('lint')
    .description('Lint an open formation template')
    .option('-t, --template <path>', `Template to lint relative to cwd. Defaults to ./${process.env.DEFAULT_FORMATION}`)
    .action(function (args) {
      const template = path.join(pwd(), args.options.template || process.env.DEFAULT_FORMATION);
      return AWSInstance.imageIdByName('ubuntu/images/hvm-ssd/ubuntu-xenial-16.04-amd64-server-20170414')
        .then(() => Formation.load(template))
      // return parseTemplate(template)
        .then(formation => {
          formation.lint();
          console.log(chalk.magenta(`Found ${formation.machines.length} instances`));
          print(_.values(formation.machines), ['name', 'type', 'region']);
        });
    });

};
