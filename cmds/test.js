'use strict';

const {AWSInstance} = require('../models');

module.exports = vorpal => {

  vorpal
    .command('test')
    .description('Test command')
    .action(function (args) {
    });

};
