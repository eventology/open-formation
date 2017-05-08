#! /usr/bin/env node

const vorpal = require('vorpal')();

vorpal
  .delimiter('open-formation$')
  .show();

require('./cmds')(vorpal);
