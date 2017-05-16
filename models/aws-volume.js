'use strict';

const Mappable = require('./mappable');
const _ = require('lodash');

module.exports = class Volume extends Mappable {

  static mapping() {
    return {
      'device': 'Attachments[0].Device',
      'instanceId': 'Attachments[0].InstanceId',
      'id': 'VolumeId',
      'zone': 'AvailabilityZone',
      'size': 'Size',
      'state': 'State',
      'type': 'VolumeType',
      'name': function(input) {
        const tags = _.keyBy(input.Tags, 'Key');
        return _.get(tags, 'Name.Value', '--none--');
      },
    };
  }

  static byInstanceId(instanceId) {
    return this.load()
      .then(volumes => {
        return _.filter(volumes, volume => volume.instanceId === instanceId);
      });
  }

  static byId(id) {
    return this.load()
      .then(volumes => _.find(volumes, volume => volume.id === id));
  }

  /**
   * By default loads only volumes that are not deleted on termination
   **/
  static load() {
    const ec2 = new AWS.EC2();
    return ec2.describeVolumes()
      .promise()
      .then(res => this.Map(res.Volumes));
  }

  reattach(...args) {
    return this.detach()
      .then(volume => volume.attach(...args));
  }

  detach() {
    const ec2 = new AWS.EC2();
    return ec2.detachVolume({
      'VolumeId': this.id
    })
      .promise()
      .then(() => this.constructor.byId(this.id))
      .then(volume => volume.waitForAvailable());
  }

  attach(instanceId, device = '/dev/sdf') {
    const ec2 = new AWS.EC2();
    return ec2.attachVolume({
      'InstanceId': instanceId,
      'VolumeId': this.id,
      'Device': device
    })
      .promise()
      .then(() => this.constructor.byId(this.id))
      .then(volume => volume.waitForAttached());
  }

  waitForAvailable() {
    const ec2 = new AWS.EC2();
    return ec2.waitFor('volumeAvailable', {
      'VolumeIds': [this.id]
    })
      .promise()
      .then(() => this.constructor.byId(this.id));
  }

  waitForAttached() {
    const ec2 = new AWS.EC2();
    return ec2.waitFor('volumeInUse', {
      'VolumeIds': [this.id]
    })
      .promise()
      .then(() => this.constructor.byId(this.id));
  }

};
