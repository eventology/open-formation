#! /usr/bin/env node

const vorpal = require('vorpal')();
const _ = require('lodash');

/**
 * Load the polyfills
 **/
require('./index');

/**
 * Load the commands
 **/
require('./cmds')(vorpal);

/**
 * Show the vorpal prompt, enter the application
 **/
vorpal
  .delimiter('open-formation$')
  .show();
