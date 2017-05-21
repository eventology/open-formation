'use strict';

const Mappable = require('./mappable');
const _ = require('lodash');
const dns = require('dns');
const {urlToIp} = require('../utils');

module.exports = class AWSService extends Mappable {

  static mapping() {
    return {
      'id': 'serviceArn',
      'name': 'serviceName',
      'clusterId': 'clusterArn',
      'status': 'status',
      'loadBalancers': 'loadBalancers',
      'desiredCount': 'desiredCount',
      'runningCount': 'runningCount',
      'pendingCount': 'pendingCount',
      'taskId': 'taskDefinition',
      'clusterName': function(input) {
        return _(input.clusterArn).split('/').last();
      }
    };
  }

  static create(params = {}) {
    _.defaults(params, {
      'desiredCount': 1
    });
    const ecs = new AWS.ECS();
    return ecs.createService(params)
      .promise()
      .then(res => this.Map(res.service));
  }

  static load(cluster = 'default') {
    const ecs = new AWS.ECS();
    const results = [];
    const servicePromises = [];
    const fn = nextToken => {
      return ecs.listServices({cluster, nextToken})
        .promise()
        .then(res => {
          const services = _.chain(res)
            .get('serviceArns', [])
            .map(serviceArn => _(serviceArn).split('/').last())
            .value();
          const p = services.length ? ecs.describeServices({cluster, services})
            .promise() : Promise.resolve({'services': []});
          servicePromises.push(p);
          return res.nextToken ? fn(res.nextToken) : undefined;
        });
    };
    return fn()
      .then(() => Promise.all(servicePromises))
      .then(results => _.chain(results)
        .map('services')
        .flatten()
        .value())
      .then(services => this.Map(services));
  }

  static registerTaskDefinition(task) {
    const ecs = new AWS.ECS();
    return ecs.registerTaskDefinition(task)
      .promise()
      .then(res => ({
        'arn': _.get(res, 'taskDefinition.taskDefinitionArn'),
        'name': _.get(res, 'taskDefinition.family'),
        'revision': _.get(res, 'taskDefinition.revision')
      }));
  }

  registerTaskDefinition(task) {
    return this.constructor.registerTaskDefinition(task)
      .then(taskDef => this.update({
        'taskDefinition': taskDef.arn
      }));
  }

  delete() {
    const ecs = new AWS.ECS();
    return ecs.deleteService({
      'cluster': this.clusterName,
      'service': this.name
    })
      .promise();
  }

  update(params = {}) {
    const ecs = new AWS.ECS();
    return ecs.updateService(_.assign({
      'cluster': this.clusterName,
      'service': this.name
    }, params))
      .promise()
      .then(() => this);
  }

  static find(cluster, filter = {}) {
    return this.load(cluster)
      .then(services => _.chain(services)
        .filter(service => {
          if (!_.keys(filter).length) return service;
          const servicePairs = _.map(_.toPairs(service), i => _.join(i, ''));
          const filterPairs = _.map(_.toPairs(filter), i => _.join(i, ''));
          // If we get an object out of this it's a match
          const intersections = _.intersection(servicePairs, filterPairs);
          return intersections.length === _.keys(filter).length;
        })
        .compact()
        .value());
  }

};
