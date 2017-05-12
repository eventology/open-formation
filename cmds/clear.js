'use strict';

const {clearScreen} = require('ansi-escapes');

module.exports = vorpal => {

  vorpal
    .command('clear')
    .description('Clear the screen')
    .action(function (args) {
      process.stdout.write(clearScreen);
      return Promise.resolve();
    });

};
