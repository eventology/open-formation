'use strict';

const _ = require('lodash');

// Global AWS
if (!global.AWS) {
  global.AWS = require('aws-sdk');
  _.defaults(AWS.config, {
    'region': process.env.AWS_REGION || 'us-east-1'
  });
}

const requires = require('not-index')(__dirname);

module.exports = _.reduce(requires, (_classes, _class) => {
  return _.assign(_classes, {
    [_class.name]: _class
  });
}, {});
