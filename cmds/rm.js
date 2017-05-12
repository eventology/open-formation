'use strict';

const {TestInstance, AWSInstance, Formation} = require('../models');

module.exports = vorpal => {

  vorpal
    .command('rm <instanceId>')
    .description('Terminate an instance by id')
    .action(function (args) {
      let instance;
      return AWSInstance.byId(args.instanceId)
        .then(_instance => {
          instance = _instance;
          this.log(instance);
          return this.prompt({
            'type': 'confirm',
            'name': 'continue',
            'default': false,
            'message': `Terminate this instance?`
          });
        })
        .then(result => {
          if (!result.continue) return this.log('Termination aborted.');
          this.log('Terminating instance...');
          return instance.terminate();
        })
        .then(() => vorpal.show());
    });

};
