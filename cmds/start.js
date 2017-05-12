'use strict';

const {TestInstance, AWSInstance, Formation} = require('../models');

module.exports = vorpal => {

  vorpal
    .command('start <instanceId>')
    .description('Start a stopped instance by id')
    .action(function (args) {
      return AWSInstance.byId(args.instanceId)
        .then(instance => instance.start());
    });

};
