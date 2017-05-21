'use strict';

const _ = require('lodash');
const {Formation, AWSInstance} = require('../models');
const chalk = require('chalk');

module.exports = (vorpal, print, formation) => {

  vorpal
    .command('status')
    .description('Print the formation status')
    .action(function (args) {
      return AWSInstance.load()
        .then(_instances => {
          const machines = _.values(formation.machines);
          const instances = _.keyBy(_instances, 'name');

          print(_.map(machines, machine => _.assign({}, machine, {
            'instanceExists': !!instances[machine.name],
            'instanceType': _.get(instances[machine.name], 'type'),
            'instanceIp': _.get(instances[machine.name], 'ip'),
            'instanceId': _.get(instances[machine.name], 'id')
          })), ['instanceId', 'name', {
            'name': 'type',
            'colorize': true
          }, {
            'name': 'region',
            'colorize': true
          }, 'keyName', {
            'name': 'instanceExists',
            'colorize': true
          }, {
            'name': 'instanceType',
            'colorize': true
          }, 'instanceIp']);
        });
    });

};
