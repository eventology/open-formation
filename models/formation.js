'use strict';

const fs = require('fs');
const _ = require('lodash');
const chalk = require('chalk');
const Instance = require('./aws-instance');
const vm = require('vm');

module.exports = class Formation {

  /**
   * Static constructor, returns a promise
   *
   * Cleanup needed, not sure if i want to keep aws resources separate
   *
   * TODO: Refactor formation.json parsing, add script phases during machine
   * boot
   **/
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

  /**
   * Provision the hardware resources
   * Then boot the resources
   **/
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

  /**
   * Run the default boot script on all machines in parallel
   * Then run the machine specific boot scripts in a serial queue
   **/
  boot() {
    if (!this.instances) throw new Error(`No instances loaded, run deploy first`);
    console.log(chalk.green(`Running "default" boot script in parallel on ${_.keys(this.instances).length} machines`));
    return Promise.all(_.map(this.instances, instance => {
      return this.runScript(instance, 'default')
        .catch(err => console.log(chalk.yellow('No default boot script present.')));
    }))
      .then(() => {
        // Executing promises in a serial queue
        // Boot order matters
        return Promise.map(this.instances, instance => this.bootInstance(instance));
      });
  }

  /**
   * Boot an instance using javascript overlayed onto shell commands
   * Promises are well supported
   **/
  bootInstance(instance) {
    const scripts = this.machineScripts[instance.name];
    return Promise.map(scripts, (script, index) => {
      console.log(chalk.green(`Running "${script}" on instance "${instance.name}" ( ${index + 1} / ${scripts.length} )`));
      return this.runScript(instance, script);
    });
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
          'i': this.instances,
          'c': instance,
          _,
          'console': console
        });
        return Promise.map(script, line => this.evalCommand(line, context));
      })
      .then(evaledScript => instance.ssh(evaledScript))
      .catch(err => {
        console.log(chalk.red(`Error runnning "${name}"`));
        console.log(instance);
        console.log(err);
        throw err;
      });
  }

  /**
   * Take a string and execute any contained javascript
   *
   * Any calls to the print function in the nested scripts output content to
   * the original string
   **/
  evalCommand(command, context) {
    if (!_.isString(command)) return Promise.reject(new Error(`Invalid command ${command}`));
    const regex = _.clone(/<%.*?%>/g);
    // Regex.exec returns null on no matches
    const matches = [];
    while (1) {
      const match = regex.exec(command);
      if (match === null) break;
      matches.push(_.head(match));
    }
    // Execute all of the found commands in the v8 vm and return promises
    if (!vm.isContext(context)) return Promise.reject(new Error('A vm context must be suppled to evalCommand'));
    // History is accessible as a global in the execution context
    // it stores the previous command results
    let replacedCommand = _.clone(command);
    context.wait = time => new Promise(r => setTimeout(r, time));
    return Promise.map(matches, js => {
      const output = [];
      context.print = function (value) {
        output.push(_.get(value, 'then') ? value : Promise.resolve(value));
      };
      const trimmedCommand = _.trim(_.clone(js), '<%>');
      const result = vm.runInContext(trimmedCommand, context);
      const promise = _.get(result, 'then') ? result : Promise.resolve(result);

      // Wait for any promise output from the vm to resolve
      // output.push(Promise.resolve().then(() => out));
      return promise
        // Reset the print function in the vm context
        .then(() => context.print = _.noop)
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
