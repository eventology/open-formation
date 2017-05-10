'use strict';

const Instance = require('./instance');
const _ = require('lodash');
const AWSElasticIp = require('./aws-elastic-ip');
const {ssh, scp, urlToIp, cmd, tmpname} = require('./utils');
const Volume = require('./volume');
const path = require('path');
const chalk = require('chalk');
const AWS = require('aws-sdk');
_.defaults(AWS.config, {
  'region': process.env.AWS_REGION || 'us-east-1'
});

module.exports = class AWSInstance extends Instance {

  static mapping() {
    return {
      'id': 'InstanceId',
      'imageId': 'ImageId',
      'state': 'State.Name',
      'keyName': 'KeyName',
      'zone': 'Placement.AvailabilityZone',
      'subnetId': 'SubnetId',
      'ip': function(input) {
        return input.PublicIpAddress || input.PrivateIpAddress;
      },
      'privateIp': 'PrivateIpAddress',
      'ebsOptimized': 'EbsOptimized',
      'name': function(input) {
        const tags = _.keyBy(input.Tags, 'Key');
        return _.get(tags, 'Name.Value', '--none--');
      },
      'type': 'InstanceType',
      'tags': function(input) {
        return _.chain(input.Tags)
          .keyBy('Key')
          .mapValues('Value')
          .value();
      }
    };
  }

  static byName(name) {
    return this.find({name});
  }

  static load(id) {
    const regions = [
      'us-east-1',
      'us-east-2',
      'us-west-1'
    ];
    const promises = _.chain(regions)
      .map(region => new AWS.EC2({region}))
      .map(ec2 => ec2.describeInstances({
          'InstanceIds': id ? [id] : undefined
        }))
      .invokeMap('promise')
      .value();
    return Promise.all(promises)
      .then(results => {
        return _.chain(results)
          .map(res => {
            const input = _.chain(res.Reservations)
              .map('Instances')
              .flatten()
              .value();
            return this.Map(input);
          })
          .map((array, index) => {
            const region = regions[index];
            return _.map(array, instance => _.assign(instance, {region}));
          })
          .flatten()
          .value();
        });
  }

  static create(options = {}) {
    _.defaults(options, {
      'imageName': 'ubuntu/images/hvm-ssd/ubuntu-xenial-16.04-amd64-server-20170414',
      'MaxCount': 1,
      'MinCount': 1,
      'type': 't2.micro',
      'BlockDeviceMappings': [{
        'DeviceName': '/dev/sda1',
        'Ebs': {
          'VolumeSize': 32,
          'VolumeType': 'gp2'
        }
      }],
      'tags': {
      },
      'name': '',
      'region': process.env.AWS_REGION || 'us-east-1'
    });
    return Promise.resolve()
      .then(() => {
        const imageName = options.imageName;
        delete options.imageName;
        if (!imageName) return options.imageId;
        return this.imageIdByName(imageName, options.region);
      })
      .then(imageId => {
        /**
         * Some special options handling
         *
         * This whole method smells pretty bad
         **/
        options.imageId = imageId;
        if (options.name) {
          _.set(options, `tags.Name`, options.name);
          delete options.name;
        }
        const params = this.Unmap(options);
        delete params.region;
        delete params.tags;
        const ec2 = new AWS.EC2({
          'region': options.region
        });
        return ec2.runInstances(params).promise();
      })
      .then(res => {
        const instance = this.Map(_.get(res, 'Instances[0]', {}));
        instance.region = options.region;
        return instance;
      })
      .then(instance => instance.setTags(options.tags))
      .then(instance => instance.waitForRunning())
      .then(instance => {
        // Now we wait for 10 secs so we can actually shell in
        return new Promise(r => setTimeout(() => r(instance), 10000));
      })
      // If there is a block device at /dev/xvdf automatically mount it
      .then(instance => instance.cmd(`
        if [ -e /dev/xvdf ]; then
          sudo mkdir /data
          sudo mount /dev/xvdf /data
        fi`))
      .then(instance => this.byId(instance.id));
  }

  ec2(config = {}) {
    return new AWS.EC2(_.defaults(config, {
      'region': this.region
    }));
  }

  static imageIdByName(name, region = 'us-east-1') {
    return new AWS.EC2({region})
      .describeImages({
        'Filters': [
          {
            'Name': 'name',
            'Values': [name]
          }
        ]
      })
      .promise()
      .then(res => {
        const images = res.Images;
        if (images.length > 1) throw new Error(`Found multiple AMI's for ${name}`);
        const imageId = _.get(res, 'Images[0].ImageId');
        if (!imageId) throw new Error(`AMI not found for name ${name}`);
        return imageId;
      });
  }

  /**
   * Transfer a file to the instance using the current machine as an
   * intermediary
   **/
  fromS3(s3Url, path) {
    const localPath = tmpname();
    return cmd(`aws s3 cp ${s3Url} ${localPath}`)
      .then(() => scp.up(this.ip, localPath, path))
      .then(() => cmd(`rm -rf ${localPath}`))
      .then(() => this.constructor.byId(this.id));
  }

  volumeByDevice(device) {
    return this.volumes()
      .then(volumes => _.find(volumes, volume => volume.device === device))
      .then(volume => {
        if (!volume) throw new Error(`Unable to find ${device} on instance ${this.id} at ${this.ip}`);
        return volume;
      });
  }

  volumes() {
    return Volume.byInstanceId(this.id);
  }

  associateUrl(url) {
    return AWSElasticIp.byUrl(url)
      .then(elasticIp => elasticIp.associate(this.id))
      .then(instance => new Promise(r => setTimeout(() => r(instance), 10000)))
      .then(() => this.constructor.byId(this.id));
  }

  attachVolumeId(id, device) {
    return Volume.byId(id)
      .then(volume => volume.attach(id, device))
      .then(() => this.constructor.byId(this.id));
  }

  waitForRunning() {
    return this.ec2().waitFor('instanceRunning', {
      'InstanceIds': [this.id]
    })
      .promise()
      .then(() => this.constructor.byId(this.id));
  }

  start() {
    return this.ec2().startInstances({
      'InstanceIds': [this.id]
    })
      .promise()
      .then(() => this.constructor.byId(this.id));
  }

  setTags(tags = {}) {
    if (!_.keys(tags).length) return this.constructor.byId(this.id);
    return this.ec2().createTags({
      'Resources': [this.id],
      'Tags': _.map(tags, (value, key) => ({
        'Key': key,
        'Value': value
      }))
    })
      .promise()
      .then(() => this.constructor.byId(this.id));
  }

  setName(Name) {
    return this.setTags({Name});
  }

  stop() {
    return this.ec2().stopInstances({
      'InstanceIds': [this.id]
    })
      .promise()
      .then(res => {
        const instanceIds = _.chain(res)
          .get('StoppingInstances')
          .map('InstanceId')
          .value();
        if (instanceIds.length !== 1) throw new Error(`Invalid instances length: ${instanceIds}`);
        return this.constructor.byId(_.first(instanceIds));
      });
  }

  terminate() {
    return this.ec2().terminateInstances({
      'InstanceIds': [this.id]
    })
      .promise()
      .then(res => {
        const instanceIds = _.chain(res)
          .get('TerminatingInstances')
          .map('InstanceId')
          .value();
        if (instanceIds.length !== 1) throw new Error(`Invalid instances length: ${instanceIds}`);
        return this.constructor.byId(_.first(instanceIds));
      });
  }

};
