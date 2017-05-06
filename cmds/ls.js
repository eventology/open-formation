'use strict';

const {cmd, pwd} = require('../utils');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const {AWSInstance} = require('../models')();
const cliff = require('cliff');
const table = require('text-table');

exports.command = `ls [region]`;
exports.desc = 'List the running instances.';
exports.builder = {
  'region': {
    'default': 'us-east-1'
  }
};

exports.handler = function(argv) {
  return AWSInstance.find(argv)
    .then(instances => {
      const fields = ['name', 'type', 'ip', 'privateIp'];
      const data = _.map(fields, field => _.map(instances, instance => {
        return _.get(instance, field) || 'empty';
      }));
      console.log(table(data, {
        'align': [ 'l', 'r' ]
      }));
    })
    .catch(console.log);
};
