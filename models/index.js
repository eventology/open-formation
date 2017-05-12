'use strict';

const _ = require('lodash');
const requires = require('not-index')(__dirname);

module.exports = _.reduce(requires, (_classes, _class) => {
  return _.assign(_classes, {
    [_class.name]: _class
  });
}, {});
