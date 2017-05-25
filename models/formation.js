'use strict';

const fs = require('fs');
const _ = require('lodash');
const chalk = require('chalk');
const Instance = require('./aws-instance');
const Evaluator = require('./evaluator');
const AWSService = require('./aws-service');

const optionRegex = /^__[a-zA-Z0-9]+__$/;

module.exports = class Formation {

  constructor(template = {}) {
    _.defaultsDeep(template, {
      'config': {
        'type': 't2.nano',
        'region': 'us-east-1'
      },
      'scripts': {},
      'machines': {},
      'services': {}
    });
    this.scripts = template.scripts;
    this.machines = _.chain(template.machines)
      .map((_machines, name) =>
        _.chain([_machines])
          .flatten()
          .map((machine, index, machines) => _.assign({}, template.config, machine, {
            'name': `${name}${machines.length > 1 ? index : ''}`
          }))
          .value())
      .flatten()
      .compact()
      .value();
    this.taskDefinitions = _.chain(template.taskDefinitions || [])
      .map((value, family) => _.assign({family}, value))
      .keyBy('family')
      .value();

    this.services = template.services;
  }

  lint() {
    this.lintNames();
    this.lintScripts();
  }

  lintNames() {
    const names = _.chain(this.machines).map('name').uniq().compact().value();
    if (names.length === this.machines.length) return;
    throw new Error(`Names length mismatch, do you have duplicate names?`);
  }

  lintScripts() {
    _.forEach(this.machines, machine => {
      const scripts = machine.__boot__ || [];
      if (!_.isArray(scripts)) throw new Error(`Non-array "__boot__" found for ${machine}`);
      _.forEach(scripts, name => {
        if (this.scripts[name]) return;
        throw new Error(`Script "${name}" not found in formation.`);
      });
    });
  }

  /**
   * Static constructor, returns a promise
   *
   * Cleanup needed, not sure if i want to keep aws resources separate
   *
   * TODO: Refactor formation.json parsing, add script phases during machine
   * boot
   **/
  static load(path) {
    return new Promise((rs, rj) => fs.readFile(path, (err, data) => {
      if (err) rj(err);
      else rs(data.toString());
    }))
      .then(data => JSON.parse(data))
      .then(template => new Formation(template));
  }

  instances() {
    const namedMachines = _.keyBy(this.machines, 'name');
    let errCount = 0;
    const maxErrCount = 5;
    const _load = () => {
      return Instance.find({
        'state': 'running'
      })
        .then(instances => {
          if (_.find(instances, instance => !instance.ip)) throw new Error(`No ip found for instance`);
          return _.chain(instances)
            .filter(instance => namedMachines[instance.name])
            .keyBy('name')
            .value();
        });
    };
    return _load()
      .catch(err => {
        console.log(chalk.yellow(`Error loading instances, trying again (${++errCount} / ${maxErrCount})`));
        if (errCount > maxErrCount) throw err;
        return _load();
      });
  }

  /**
   * Provision the hardware resources
   * Then boot the resources
   **/
  createInstances() {
    const createdNames = [];

    const promises = _.map(this.machines, machine => {
      return Instance.findOne({
        'name': machine.name,
        'state': 'running'
      })
        .then(instance => {
          if (instance) return instance;
          createdNames.push(machine.name);
          const params = _.omitBy(machine, (value, key) => optionRegex.test(key));

          return Instance.create(params)
            .log(i => console.log(chalk.green(`Created instance "${machine.name}", "${i.id}"`)));
        });
    });

    return Promise.all(promises)
      .then(() => {
        const sortedNames = _.sortBy(createdNames, name => _.findIndex(this.machines, ['name', name]));
        return this.boot(sortedNames);
      });
  }

  /**
   * Run the default boot script on all machines in parallel
   * Then run the machine specific boot scripts in a serial queue
   **/
  /**
   * Boot an instance using javascript overlayed onto shell commands
   * Promises are well supported
   **/
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
  boot(names = []) {
    if (!names) throw new Error(`No instance names supplied, include them as the first argument`);
    if (!names.length) return Promise.resolve();
    const defaultScript = 'default';
    const baseContext = {
      _,
      'console': console
    };
    const namedMachines = _.keyBy(this.machines, 'name');
    console.log(chalk.green(`Running "${defaultScript}" boot script in parallel on ${names.length} machines`));
    return this.run(defaultScript, names)
      .then(() => this.instances())
      .then(instances => {
        /**
         * After the default script is run subsequent instances and scripts are run
         * in a serial queue using Promise.map
         **/
        return Promise.map(names, name => {
          const instance = instances[name];
          if (!instance) throw new Error(`Unable to find instance by name "${name}"`);
          const machine = namedMachines[name];
          if (!machine) throw new Error(`Unable to find machine by name "${name}"`);
          const scripts = machine.__boot__ || [];

          /**
           * Run all the instance boot scripts requested
           **/
          return Promise.map(scripts, (scriptName, index) => {
            console.log(chalk.green(`Running "${scriptName}" on instance "${name}" (${index + 1} / ${scripts.length})`));
            return this.run(scriptName, name);
        });
      });
    });
  }

/**
 * Run a script on a set of instances by name
 *
 *
 * @param {String} scriptName The name of the script to run, defined in formation
 * @param {Array} names An array of machine names to run the script on
 **/
  run(scriptName, names = []) {
    if (_.isString(names)) names = [names];
    const script = this.scripts[scriptName] || scriptName;
    // if (!script) throw new Error(`Unabled to find "${scriptName}" in current formation`);
    return this.exec(script, names)
      .catch(err => {
        console.log(chalk.red(`Error running script "${scriptName}"`));
        throw err;
      });
  }

  exec(commands, names = []) {
    if (_.isString(names)) names = [names];
    if (_.isString(commands)) commands = [commands];
    if (!commands) throw new Error('No commands supplied to exec');
    return this.instances()
      .then(instances => {
        return Promise.all(_.map(names, name => {
          const instance = instances[name];
          if (!instance) throw new Error(`Unable to find instance for name "${name}"`);
          return instance.command(commands, {
            'i': instances
          });
        }));
      });
  }

  versionService(name) {
    const service = _.get(this, `services[${name}]`);
    if (!service) throw new Error(`Unable to find service named ${name}`);
    const definition = service.taskDefinition;
    if (!definition) throw new Error(`Unable to find task definition for service ${name}`);
    return Promise.all([
      AWSService.registerTaskDefinition(definition),
      AWSService.find(service.cluster, {name})
    ])
      .then(results => {
        const taskDef = results[0];
        const services = results[1];
        if (services.length > 1) throw new Error('Invalid number of services found');
        const service = _.head(services);
        const serviceDef = this.services[name];
        return service ? service.update(_.assign(serviceDef, {
          'taskDefinition': taskDef.arn
        })) : AWSService.create(_.assign(serviceDef, {
          'cluster': service.cluster,
          'serviceName': name,
          'taskDefinition': taskDef.arn
        }));
      })
      .then(() => AWSService.find(service.cluster, {name}))
      .then(results => _.head(results));
  }

};
