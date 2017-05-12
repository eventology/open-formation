'use strict';

const _ = require('lodash');

/**
 * Promise polyfill that allows logging
 *
 * The promise returned will always resolve with the value of the previous
 * promise. This allow arbitrary logic/returns in fn.
 *
 * @param {Function} fn The callback function, defaults to console.log
 * @return {Promise} Returns a promise resolving to the previous value (not fn)
 **/
Promise.prototype.log = Promise.prototype.log || function (fn) {
  return this.then(arg => {
    if (fn) fn.call(this, arg);
    else console.log(arg);
    return arg;
  });
};

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

module.exports = require('./utils');
