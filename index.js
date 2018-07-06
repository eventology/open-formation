'use strict';

const _ = require('lodash');

/**
 * A serial queue implementation for promises based on the lodash map function
 *
 * @param {Object|Array} objects The contents to iterate over
 * @param {Function} iteratee The function to call for each object. Arguments
 *                            are (obj, key) and the return is automatically
 *                            wrapped in a promise.
 **/
Promise.map = Promise.map || function (objects = [], iteratee = (obj, key) => obj) {
  const results = [];
  // A serial queue for promises
  return _.reduce(objects, (promise, object, key) => {
    return promise
      .then(() => iteratee(object, key))
      .then(r => results.push(r));
  }, Promise.resolve()).then(() => results);
};

module.exports = require('./models');
