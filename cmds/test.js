'use strict';

const {TestInstance, AWSInstance, Formation} = require('../models');

module.exports = vorpal => {

  vorpal
    .command('test')
    .description('Test command')
    .action(function (args) {
      return TestInstance.load().log();
    });

};
