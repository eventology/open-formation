'use strict';

const _ = require('lodash');
const chalk = require('chalk');
const requires = require('not-index')(__dirname);

process.env.DEFAULT_FORMATION = process.env.DEFAULT_FORMATION || 'formation.json';

/**
 * require and then execute each file in the surrounding directory
 *
 * cmd(...args) could be thought of as require('./*')(...args)
 **/
module.exports = vorpal => _.map(requires, cmd => cmd(vorpal, print));

/**
 * A function to print the contents of `data` in a table with headers defined
 * in `_options`
 *
 * @param {Object} data The table data to search
 * @param {Object|Array} _options The header information
 **/
function print(data, _options) {
  const options = _.chain([_options])
    .flatten()
    .map(opt => _.isString(opt) ? {'name': opt} : opt)
    .map(opt => _.defaults(opt, {
      'transform': i => `${i}`
    }))
    .value();

  const rows = _.chain([data])
    .flatten()
    .compact()
    .map(obj => _.pick(obj, _.map(options, 'name')))
    .value();

  // Calculate the max length for each column in the table
  const columnLengths = _.reduce(options, (lengths, option) => {
    const name = option.name;
    let length = name.length;
    _.forEach(rows, row => {
      const newLength = `${row[name]}`.length;
      length = newLength > length ? newLength : length;
    });
    lengths[name] = length;
    return lengths;
  }, {});

  // Generate the header based on keys
  const header = _(options)
    .map(opt => _.padEnd(opt.name, columnLengths[opt.name]))
    .join(' ');
  console.log(chalk.cyan(header));

  // Generate the table body based on row content
  const bodyString = _(rows)
    // Add padding for each row
    .map(row => _.mapValues(row, (value, key) => _.padEnd(value, columnLengths[key])))
    // Map values into strings
    .map(row => _.map(options, opt => opt.transform(row[opt.name])))
    .map(stringRow => _.join(stringRow, ' '))
    .join('\n');
  console.log(bodyString);
}
