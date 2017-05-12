'use strict';

const Mappable = require('./mappable');
const _ = require('lodash');
const AWSElasticIp = require('./aws-elastic-ip');
const {ssh, scp, urlToIp, cmd, tmpname, pwd} = require('./utils');
const Volume = require('./volume');
const path = require('path');
const colors = require('colors');

module.exports = class Instance extends Mappable {

  static mapping() {
    throw new Error('Instance must be subclassed with a platform connector like AWS.');
  }

  static byUrl(url) {
    return urlToIp(url)
      .then(ip => this.findOne({ip}));
  }

  static byId(id) {
    return this.findOne({id});
  }

  static find(filter = {}) {
    return this.load()
      .then(instances => _.chain(instances)
        .filter(instance => {
          if (!_.keys(filter).length) return instance;
          const instancePairs = _.map(_.toPairs(instance), i => _.join(i, ''));
          const filterPairs = _.map(_.toPairs(filter), i => _.join(i, ''));
          // If we get an object out of this it's a match
          return _.intersection(instancePairs, filterPairs).length ? instance : undefined;
        })
        .compact()
        .value());
  }

  static findOne(filter) {
    return this.find(filter)
      .then(results => {
        if (results.length !== 1) throw new Error('findOne did not find exactly 1 match.');
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
    return scp.up(this.ip, localPath, remotePath, this.keyPath())
      .then(() => this.constructor.byId(this.id));
  }

  download(remotePath, localPath) {
    return scp.down(this.ip, remotePath, localPath, this.keyPath())
      .then(() => this.constructor.byId(this.id));
  }

};
