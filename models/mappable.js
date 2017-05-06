'use strict';

const _ = require('lodash');

class Mappable {

  constructor(input) {
    if (!input) throw new Error('Invalid input.');
    const mapping = this.constructor.mapping();
    // Map keys on this to values as keys in input
    _.assignWith(this, mapping, (thisValue, mapValue) => {
      if (_.isFunction(mapValue)) return mapValue(input) || null;
      return _.get(input, mapValue, null);
    });
  }

  static Map(inputs) {
    return _.chain([inputs])
      .flatten()
      .compact()
      .map(input => new this(input))
      .thru(arr => {
        if (!_.isArray(inputs) && arr.length === 1) {
          return arr[0];
        } else return arr;
      })
      .value();
  }

  static Unmap(inputs) {
    const mapping = this.mapping();
    return _.chain([inputs])
      .flatten()
      .compact()
      // Map the key to a different name, if available
      .map(input => {
        const r = {};
        _.forEach(input, (value, key) => {
          let path = mapping[key];
          _.set(r, _.isString(path) ? path : key, value);
        });
        return r;
      })
      // Extract object from arrays of length 1
      .thru(arr => {
        if (!_.isArray(inputs) && arr.length === 1) {
          return arr[0];
        } else return arr;
      })
      .value();
  }

  static mapping() {
    throw new Error('Mappable must be subclassed.');
  }

}

module.exports = Mappable;
