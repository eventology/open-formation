'use strict';

const fs = require('fs');
const _ = require('lodash');
const chalk = require('chalk');
const Instance = require('./aws-instance');
const vm = require('vm');

module.exports = class Formation {

  static load(path) {
    const formation = new Formation();
    return new Promise((rs, rj) => fs.readFile(path, (err, data) => {
      if (err) rj(err);
      else rs(data.toString());
    }))
      .then(JSON.parse)
      .then(template => {
        formation.template = _.defaultsDeep(template, {
          'machines': {},
          'config': {
            'type': 't2.nano',
            'region': 'us-east-1'
          },
          'scripts': {}
        });

        formation.machineScripts = {};
        formation.machines = _.chain(template.machines)
          .map((_machines, name) => {
            const machines = _.flatten([_machines]);
            return _.map(machines, (options, index) => {
              return _.assign(_.clone(template.config), {
                'name': `${name}${machines.length > 1 ? index : ''}`
              }, options);
            });
          })
          .flatten()
          .map(machine => {
            const bootKey = '__boot__';
            const boot = _.get(machine, bootKey);
            delete machine[bootKey];
            formation.machineScripts[machine.name] = _.chain([boot]).flatten().compact().value();
            return machine;
          })
          .value();
        return formation;
      });
  }

  deploy() {
    let count = 0;
    return Promise.all(_.map(this.machines, machine => {
      return Instance.create(machine)
        .then(instance => {
          console.log(chalk.green(`Instance ${++count} of ${this.machines.length} deployed.`));
          return instance;
        });
    }))
      .then(instances => {
        this.instances = _.keyBy(instances, 'name');
        return this;
      });
  }

  boot() {
    if (!this.instances) throw new Error(`No instances loaded, run deploy first`);
    console.log(chalk.green(`Running "default" boot script in parallel on ${_.keys(this.instances).length} machines`));
    return Promise.all(_.map(this.instances, instance => {
      return this.runScript(instance, 'default');
    }))
      .then(() => {
        // Executing promises in a serial queue with 2 second delay between items
        // Boot order matters
        return _.reduce(this.instances, (promise, instance, name) => {
          return promise
            .then(() => this.bootInstance(instance))
            .then(() => new Promise(r => setTimeout(r, 2000)));
        }, Promise.resolve());
      });
  }

  bootInstance(instance) {
    const scripts = this.machineScripts[instance.name];
    return _.reduce(scripts, (promise, script) => {
      console.log(chalk.green(`Running "${script} on instance ${instance.name}`));
      return this.runScript(instance, script);
    }, Promise.resolve(instance));
  }

  /**
   * Evaluate a series of strings (shell commands) with embedded JS
   *
   * Example use:
   *
   * This is a shell command that will be executed on machine A, a manager in
   * a swarm. Machine B needs a token to join the swarm and receive work. We
   * create a command using the result of a command on machine A (the token)
   * to register the machine in the swarm. The code is executed on the machines
   * via SSH.
   *
   * docker swarm join --token <% this.manager.ssh('docker swarm join-token worker -q')) %> <% this.manager.ip %>:2377
   *
   * The content between <% %> is evaluated as javascript with the current
   * instance this bound to the execution context. In the example above a remote
   * shell command is being executed on machine B using the result of a command
   * from machine A. Machine A is a docker swarm manager and machine B is an
   * instance attempting to join the swarm. The computer executing this program
   * builds shell commands by executing shell commands on various machines
   * using javascript as the logical binding.
   *
   */
  runScript(instance, name) {
    return Promise.resolve()
      .then(() => {
        if (!this.instances) throw new Error(`No instances loaded, run deploy first`);
        const script = _.get(this, `template.scripts[${name}]`);
        if (!script) throw new Error(`Unable to find script ${name}`);
        // Context is provided so the script can store and share variables
        const context = vm.createContext({
          'i': instance,
          _,
          'this': this
        });
        return Promise.all(_.map(script, line => this.evalCommand(line, context)));
      })
      .then(evaledScript => instance.ssh(evaledScript))
      .catch(err => {
        console.log(chalk.red(`Error runnning "${name}"`));
        console.log(instance);
        console.log(err);
        throw err;
      });
  }

  evalCommand(command, context) {
      if (!_.isString(command)) return Promise.reject(new Error(`Invalid command ${command}`));
      const regex = /<%.*?%>/;
      // Regex.exec returns null on no matches
      const matches = regex.exec(command) || [];

      // Execute all of the found commands in the v8 vm and return promises
      if (!vm.isContext(context)) throw new Error('A vm context must be suppled to evalCommand');
      // History is accessible as a global in the execution context
      // it stores the previous command results
      context.history = [];

      const promises = _.map(matches, js => {
        return Promise.resolve()
          .then(() => {
            const output = [];
            context.print = function (...args) {
              output.push(..._.map(args, arg => Promise.resolve().then(() => arg)));
            };
            const out = vm.runInContext(_.trim(js, '<%>'), context);
            context.print = _.noop;

            // Wait for any promise output from the vm to resolve
            output.push(Promise.resolve().then(() => out));
            return Promise.all(output)
              // Then get rid of it
              .then(results => results.slice(0, -1));
          })
          .then(outputs => console.log(outputs) && outputs)
          .then(outputs => _(outputs).compact().join(' '));
      });
      // A part is a part of the total command.
      // There can be multiple <% %> statements in a single command
      // They are evaluated left to right
      return Promise.all(promises)
        .then(parts => {
          // Take the execution result and put it in place of the original
          // <% manager.ip %> turns into 32.40.172.48
          // You can put javascript logic into shell scripts to control
          // variables such as network addresses during deployment
          return _(parts).reduce((_command, part, index) => {
            console.log(part);
            let replacement = '';
            if (_.isString(part) || _.isNumber(part)) replacement = part;
            context.history.push(part);
            return _.replace(_command, matches[index], replacement);
          }, command);
        });
  }
};
