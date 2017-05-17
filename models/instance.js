'use strict';

const Mappable = require('./mappable');
const _ = require('lodash');
const {ssh, scp, urlToIp, pwd} = require('../utils');
const path = require('path');
const Evaluator = require('./evaluator');

module.exports = class Instance extends Mappable {

  static mapping() {
    throw new Error('Instance must be subclassed with a platform connector like AWS.');
  }

  static byUrl(url) {
    return urlToIp(url)
      .then(ip => this.findOne({ip}))
      .then(instance => {
        if (!instance) throw new Error(`Unable to find instance with url "${url}"`);
        return instance;
      });
  }

  static byId(id) {
    return this.findOne({id})
      .then(instance => {
        if (!instance) throw new Error(`Unable to find instance with id "${id}"`);
        return instance;
      });
  }

  static find(filter = {}) {
    return this.load()
      .then(instances => _.chain(instances)
        .filter(instance => {
          if (!_.keys(filter).length) return instance;
          const instancePairs = _.map(_.toPairs(instance), i => _.join(i, ''));
          const filterPairs = _.map(_.toPairs(filter), i => _.join(i, ''));
          // If we get an object out of this it's a match
          const intersections = _.intersection(instancePairs, filterPairs);
          return intersections.length === _.keys(filter).length;
        })
        .compact()
        .value());
  }

  static findOne(filter) {
    return this.find(filter)
      .then(results => {
        if (results.length > 1) throw new Error('findOne found more than 1 match.');
        return _.head(results);
      });
  }

  /**
   * Load a list of all running instances
   **/
  static load(id) {
    throw new Error('Instance must be subclassed with a platform connector like AWS.');
  }

  /**
   * Create a new instance using the supplied options
   **/
  static create(options = {}) {
    throw new Error('Instance must be subclassed with a platform connector like AWS.');
  }

  static fromArgs(argv) {
    const url = argv.url;
    const id = argv.id;
    return this.findOne({id, url});
  }

  keyPath() {
    return path.join(pwd(), `${this.keyName}_${this.region}.pem`);
  }

  command(commands, context = {}) {
    const evaluator = new Evaluator(_.defaults(context, {
      'c': this,
      _,
      'console': console
    }));
    return evaluator.evaluate(commands)
      .then(evaledCommands => this.ssh(evaledCommands, true));
  }

  ssh(commands, results = false) {
    return ssh({
      'hostname': this.ip,
      'keyPath': this.keyPath(),
      commands
    })
      .then(_results => {
        if (results) return _results;
        return this.constructor.byId(this.id);
      });
  }

  upload(localPath, remotePath) {
    return scp.up({
      'host': this.ip,
      'privateKey': this.keyPath(),
      localPath,
      remotePath
    })
      .then(() => this.constructor.byId(this.id));
  }

  download(remotePath, localPath) {
    return scp.down({
      'host': this.ip,
      'privateKey': this.keyPath(),
      localPath,
      remotePath
    })
      .then(() => this.constructor.byId(this.id));
  }

};
