'use strict';

const fs = require('fs');
const _ = require('lodash');
const path = require('path');

module.exports = () => {
  const models = {};
  const files = fs.readdirSync(__dirname);
  const fileRegex = /^(?!index)[a-z\-]+\.js$/;
  _.forEach(files, file => {
    if (!fileRegex.test(file)) return;
    const _class = require(path.join(__dirname, file));
    models[_class.name] = _class;
  });
  return models;
};
