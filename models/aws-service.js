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

  static registerTaskDef(task) {
    const ecs = new AWS.ECS();
    return ecs.registerTaskDefinition(task)
      .promise();
  }

  static byUrl(url) {
    return Promise.all([
      urlToIp(url),
      this.load()
    ])
      .then(results => {
        const ip = results[0];
        const ips = results[1];
        return _.find(ips, {ip});
      });
  }

  associate(instanceId) {
    const ec2 = new AWS.EC2();
    return ec2.associateAddress({
      'AllocationId': this.id,
      'InstanceId': instanceId
    }).promise();
  }

  disassociate() {
    const ec2 = new AWS.EC2();
    return ec2.disassociateAddress({
      'AllocationId': this.id
    }).promise();
  }

  release() {
    const ec2 = new AWS.EC2();
    return ec2.releaseAddress({
      'AllocationId': this.id
    }).promise();
  }

};
