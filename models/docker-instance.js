'use strict';

const Instance = require('./instance');
const _ = require('lodash');
const {ssh, scp, urlToIp, cmd, tmpname} = require('./utils');
const path = require('path');
const chalk = require('chalk');
const http = require('http');
const URL = require('url');
const qs = require('querystring');

module.exports = class TestInstance extends Instance {

  static mapping() {
    return {
      'id': 'Id',
      'imageId': 'ImageID',
      'state': 'State',
      'ip': function(input) {
        return '127.0.0.1';
      },
      'name': 'Names[0]',
      'type': 'InstanceType',
      'tags': 'Labels'
    };
  }

  static docker(pathname, _query = {}, options = {}) {
    // In an http request use either host:port or socketPath
    const query = _.mapValues(_query, (value, key) => {
      if (_.isObject(value)) return JSON.stringify(value);
      return value;
    });
    const path = URL.format({pathname, query});
    _.defaults(options, {
      'socketPath': '/var/run/docker.sock',
      'method': 'GET',
      'path': path
    });
    return new Promise((resolve, reject) => {
      let data = '';
      let err;
      http.request(options, res => {
        res.setEncoding('utf8');
        res.on('data', _data => data += _data);
        res.on('error', _err => err = _err);
        res.on('end', () => {
          if (err) return reject(err);
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            resolve(data);
          }
        });
      }).end();
    });
  }

  static byName(name) {
    return this.find({name});
  }

  static load(id) {
    return this.docker('/v1.24/containers/json', {
      'all': 1,
      'filters': {
        'status': ['running']
      }
    })
      .then(output => this.Map(output));
  }

  static create() {
    const port = _.random(10000, 65000);
    return this.docker('/v1.24/containers/create', {
      'Image': 'rastasheep/ubuntu-sshd:16.04',
      'HostConfig': {
        'PortBindings': {
          '22/tcp': [{
            'HostPort': `${port}`
          }]
        }
      }
    }, {
      'method': 'POST'
    })
      .then(res => {
        if (!_.get(res, 'Id')) throw new Error('Unable to find Id on docker response.');
        return this.byId(res.Id);
      })
      .then(instance => {
        instance.port = port;
        return instance;
      });
  }

  setTags(tags = {}) {
    if (!_.keys(tags).length) return this.constructor.byId(this.id);
    return this.docker('/v1.24/containers/json', {
      'all': 1,
      'filters': JSON.stringify({
        'status': ['running']
      })
    })
      .then(output => this.Map(output));
  }

  setName(Name) {
    return this.setTags({Name});
  }

  ssh(commands) {
    return ssh({
      'hostname': `${this.ip}:${this.port || 22}`,
      'username': 'root',
      'password': 'root',
      commands
    })
      .then(() => this.constructor.byId(this.id));
  }

};
