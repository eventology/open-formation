#! /usr/bin/env node

/**
 * Load the polyfills
 **/
require('./index');

const vorpal = require('vorpal')();
const {Formation} = require('./models');
const _ = require('lodash');
const {pwd} = require('./utils');
const path = require('path');
const chalk = require('chalk');
const fs = require('fs');

const FORMATION_FILENAMES = [
  'formation.yaml',
  'formation.yml',
  'formation.json'
];

const template = _.chain(FORMATION_FILENAMES)
  .map(name => path.join(pwd(), name))
  .find(filepath => fs.existsSync(filepath))
  .value();

const pems = _.chain(fs.readdirSync(pwd()))
  .filter(filename => filename.indexOf('.pem') !== -1)
  .value();

Formation.load(template)
  .then(formation => {

    if (formation.machines.length && !pems.length) {
      console.log(chalk.red(`Warning: No private key found in working directory`));
    }

    /**
     * Load the commands
     **/
    require('./cmds')(vorpal, print, formation);

    /**
     * Show the vorpal prompt, enter the application
     **/
    vorpal
      .delimiter('open-formation$')
      .show()
      .parse(process.argv);
  })
  .catch(err => {
    console.log(`
${chalk.red(`I couldn't load a formation file from your current directory.`)}

Looked for:
  ${_.join(FORMATION_FILENAMES, '\n  ')}
`);
    console.log(chalk.magenta('Displaying help:'))
    /**
     * Mock the commands
     **/
    require('./cmds')(vorpal, print, {});
    vorpal.exec('help');
  })  ;

/**
 * A function to print the contents of `data` in a table with headers defined
 * in `_options`
 *
 * @param {Object} data The table data to search
 * @param {Object|Array} _options The header information
 * @param {String} _options.name The name of the property to use
 * @param {Boolean} _options.colorize Set this to true to colorize unique values
 * @param {Function} _options.transform A function to take an input string and
                                        return a transformed string
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

  const colors = ['blue', 'green', 'red', 'yellow', 'magenta'];
  let colorIndex = 0;
  // This will get built on to
  const colorMap = {
    'true': 'green',
    'false': 'red',
    'ACTIVE': 'green',
    'DRAINING': 'red'
  };

  // Generate the table body based on row content
  const bodyString = _(rows)
    // Add padding for each row
    .map(row => _.mapValues(row, (value, key) => _.padEnd(`${value}`, columnLengths[key])))
    // Map values into strings
    .map(row => _.map(options, opt => {
      const value = row[opt.name];
      let string = opt.transform(value);

      if (!opt.colorize) return string;

      const mapValue = _.trim(value);
      const color = colorMap[mapValue] || colors[++colorIndex % colors.length];
      colorMap[mapValue] = color;
      return chalk[color](string);
    }))
    .map(stringRow => _.join(stringRow, ' '))
    .join('\n');
  console.log(bodyString);
}
