'use strict';

const {pwd} = require('../utils');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const {AWSInstance} = require('../models');
const chalk = require('chalk');

module.exports = (vorpal, print) => {

  vorpal
    .command('ls')
    .description('List your running instances. Excludes terminated machines.')
    .action(function (args) {
      return AWSInstance.find()
        .then(_instances => {
          const instances = _.filter(_instances, instance => {
            return instance.state !== 'terminated';
          });
          print(instances, ['id', {
            'name': 'state',
            'transform': state => {
              const stateColors = {
                'running': 'green',
                'stopped': 'blue',
                'shutting-down': 'red'
              };
              const color = stateColors[state];
              if (!color) return state;
              return chalk[color](state);
            }
          }, 'type', 'name', 'region', 'ip']);
        });
    });
    
  };
