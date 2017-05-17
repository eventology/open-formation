'use strict';

const _ = require('lodash');
const requires = require('not-index')(__dirname);

/**
 * require and then execute each file in the surrounding directory
 *
 * cmd(...args) could be thought of as require('./*')(...args)
 **/
module.exports = (...args) => _.map(requires, cmd => cmd(...args));
