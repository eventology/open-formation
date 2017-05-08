'use strict';

const {cmd, pwd} = require('../utils');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const {AWSInstance} = require('../models')();

const service = process.env.OF_SERVICE || 'AWS';

// exports.command = `deploy [template] [region] [service]`;
// exports.desc = 'Deploy a formation template.';
// exports.builder = {
//   'template': {
//     'default': 'of.json'
//   },
//   'region': {
//     'default': 'us-east-1'
//   },
//   'service': {
//     'default': `${service}`
//   }
// };

module.exports = vorpal => {

  vorpal
    .command('deploy [template]')
    .description('Deploy an open formation template')
    .action(function (args) {
      const template = pwd();
      console.log(template);
      return Promise.resolve('test');
    });

};

// exports.handler = function(argv) {
//   const contents = fs.readFileSync(path.join(pwd(), argv.template), 'utf8');
//   const parsed = JSON.parse(contents);
//   const promises = _.map(parsed, (value, key) => {
//     if (/^__*__$/.test(key)) return;
//     // Use the key as the instance name
//     _.set(value, 'tags.Name', key);
//     // Then create the instance in the region
//     return AWSInstance.create(_.assign({
//       'region': argv.region
//     }, value));
//   });
//   // Wait for the promises and log result for now
//   return Promise.all(_.compact(promises))
//     .then(instances => console.log(instances));
// };
