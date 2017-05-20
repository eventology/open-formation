'use strict';

const Mappable = require('./mappable');
const _ = require('lodash');
const dns = require('dns');
const {urlToIp} = require('../utils');
const AWS = require('aws-sdk');
_.defaults(AWS.config, {
  'region': process.env.AWS_REGION || 'us-east-1'
});

module.exports = class ElasticIp extends Mappable {

  static mapping() {
    return {
      'id': 'AllocationId',
      'instanceId': 'InstanceId',
      'ip': 'PublicIp'
    };
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

  static load() {
    const ec2 = new AWS.EC2();
    return ec2.describeAddresses()
      .promise()
      .then(res => this.Map(res.Addresses));
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
