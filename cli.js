#! /usr/bin/env node

const vorpal = require('vorpal')();
const _ = require('lodash');

vorpal
  .delimiter('open-formation$')
  .show();

Promise.prototype.log = Promise.prototype.log || function (fn) {
  return this.then(arg => {
    if (fn) fn.call(this, arg);
    else console.log(arg);
    return arg;
  });
};

Promise.map = function (objects = [], iteratee = (obj, key) => obj) {
  const results = [];
  // A serial queue for promises
  return _.reduce(objects, (promise, object, key) => {
    return promise
      .then(() => iteratee(object, key))
      .then(r => results.push(r));
  }, Promise.resolve()).then(() => results);
};

require('./cmds')(vorpal);
