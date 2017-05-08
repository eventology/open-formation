'use strict';

const {cmd, pwd} = require('../utils');
const fs = require('fs');
const _ = require('lodash');
const path = require('path');
const {AWSInstance} = require('../models')();
const chalk = require('chalk');

module.exports = vorpal => {

  vorpal
    .command('deploy [template]')
    .description('Deploy an open formation template')
    .option('-t, --template', 'Template to deploy relative to cwd. Defaults to ./of.json')
    .option('create')
    .action(function (args) {
      const template = pwd();
      console.log(template);
      return Promise.resolve('test');
    });

  vorpal
    .command('ls')
    .description('List your running instances.')
    .option('-s, --state <state>', 'State of the machine')
    .option('-i, --id <id>', 'Id of the machine')
    .option('-n, --name <name>', 'Name of the machine')
    .option('-t, --type <type>', 'Type of the machine')
    .option('-r, --region <region>', 'Region of the machine')
    .action(function (args) {
      return AWSInstance.find(args.options)
        .then(_instances => {
          const display = ['id', 'state', 'type', 'region'];
          const instances = _.map(_instances, instance => _.pick(instance, display));

          const rows = _.chain(instances)
            .map(instance => _.pick(instance, display))
            .sortBy(instance => 'state')
            .value();

          // Calculate the max length for each column in the table
          const headerLengths = _.chain(display)
            .keyBy(header => header.length)
            .invert()
            .mapValues((length, key) => {
              _.forEach(rows, row => {
                const newLength = _.get(row, `${key}.length`, 0);
                length = newLength > length ? newLength : length;
              });
              return length;
            })
            .value();

          const header = _(display)
            .map(name => _.padEnd(name, headerLengths[name]))
            .join(' ');
          console.log(chalk.cyan(header));

          const bodyString = _(rows)
            // Add padding for each row
            .map(row => _.mapValues(row, (value, key) => _.padEnd(value, headerLengths[key])))
            // Map values into strings
            .map(row => _.map(display, name => row[name]))
            .map(stringRow => _.join(stringRow, ' '))
            .join('\n');
          console.log(bodyString);
        });
    });

};

// module.exports = vorpal => {
//   const files = fs.readDirSync(__dirname);
//   const jsRegex = /^(?!index)[a-z\-]\.js$/;
//   _.forEach(files, filename => {
//     const filepath = path.join(__dirname, filename);
//     if (!jsRegex.test(filepath)) return;
//     require(filepath)(vorpal);
//   });
// };
