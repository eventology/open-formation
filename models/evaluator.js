'use strict';

const _ = require('lodash');
const vm = require('vm');
const chalk = require('chalk');

module.exports = class Evaluator {

  constructor(context = {}) {
    this.context = vm.createContext(_.assign(context, {
      /** Add wait as a global wait function in scripts **/
      'wait': time => new Promise(r => setTimeout(r, time)),
      'process': process
    }));
  }

  evaluate(commands = []) {
    return Promise.map(commands, command => this._evaluate(command));
  }

  static parse(string) {
    const regex = _.clone(/<%.*?%>/g);
    const matches = [];
    while (1) {
      const match = regex.exec(string);
      // Regex.exec returns null on no matches
      if (match === null) break;
      matches.push(_.head(match));
    }
    return matches;
  }

  parse(string) {
    return this.constructor.parse(string);
  }

  /**
   * Take a string and execute any contained javascript
   *
   * Any calls to the print function in the nested scripts output content to
   * the original string
   **/
  _evaluate(command) {
    if (!_.isString(command)) return Promise.reject(new Error(`Invalid command ${command}`));
    const matches = this.parse(command);

    // Execute all of the found commands in the v8 vm and return promises
    if (!vm.isContext(this.context)) return Promise.reject(new Error('A vm context must be suppled to evalCommand'));

    // The command string to be mutated
    let replacedCommand = _.clone(command);
    return Promise.map(matches, js => {
      console.log(chalk.green(`Executing command ${command}`));
      const output = [];
      this.context.print = function (value) {
        output.push(_.get(value, 'then') ? value : Promise.resolve(value));
      };
      const trimmedCommand = _.trim(_.clone(js), '<%>');
      const result = vm.runInContext(trimmedCommand, this.context);
      const promise = _.get(result, 'then') ? result : Promise.resolve(result);

      // Wait for any promise output from the vm to resolve
      return promise
        // Reset the print function in the vm context
        .then(() => this.context.print = _.noop)
        // Wrap the outputs
        .then(() => Promise.all(output))
        // Replace command parts if necessary
        .then(parts => {
          const replacement = _(parts)
            .filter(p => _.isString(p) || _.isNumber(p))
            .join(' ');
          replacedCommand = _.replace(replacedCommand, js, replacement);
        });
    })
      .then(() => replacedCommand);
  }

};
