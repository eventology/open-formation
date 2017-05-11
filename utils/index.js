'use strict';

const _ = require('lodash');
const {exec, execSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const DNS = require('dns');
const URL = require('url');
const uuid = require('uuid');
const chalk = require('chalk');
const NodeSSH = new require('node-ssh');

const SSH_OPTS = `-o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no`;

/**
 * Function for executing shell commands synchronously
 *
 * @param {String|Array} command A single command, or an array of commands.
 * @returns {Array} Returns array containing results of commands
 **/

function cmd(_commands) {
  const commands = _.chain([_commands])
    .flatten()
    .compact()
    .value();
  return Promise.map(commands, command => {
    return new Promise((resolve, reject) => {
      exec(command, (err, stdout, stderr) => {
        console.log(chalk.yellow(stderr));
        if (err) reject(err);
        else resolve(stdout);
      });
    });
  })
    .then(results => _.isArray(_commands) ? results : _.head(results));
}

function pwd() {
  return _.trimEnd(execSync('pwd'), '\n');
}

/**
 * Run 1 or more commands on a remote machine
 *
 * Multiple commands will be grouped in single quotes. Single quotes in commands
 * will be escaped automatically
 **/
function ssh(options = {}) {
  const {hostname, username, keyPath, commands} = _.defaults(options, {
    'hostname': '',
    'username': 'ubuntu',
    'keyPath': '',
    'commands': ''
  });
  const name = `${username}@${hostname}`;
  console.log(chalk.blue(`Connecting to ${name}`));

  const _ssh = new NodeSSH();
  const maxCount = 5;
  let count = 0;
  const connect = () => _ssh.connect({
    'host': hostname,
    'username': username,
    'privateKey': keyPath
  })
    .catch(err => {
      if (count++ > maxCount) throw err;
      console.log(chalk.yellow(`Error connecting to ${name}, retrying. (${count} / ${maxCount})`));
      return new Promise(r => setTimeout(r, 5000))
        .then(() => connect());
    });

  const cmds = _.chain([commands])
    .flatten(commands)
    .map(v => _.trim(v))
    .compact()
    .value();
  return connect()
    // Execute cmds in a serial queued
    .then(() => Promise.map(cmds, _cmd => {
        console.log(chalk.cyan(`${name}: ${_cmd}`));
        return _ssh.execCommand(_cmd);
      }))
    .then(result => {
      console.log(chalk.blue(`Disconnecting from ${name}`));
      _ssh.dispose();
      if (!_.isArray(commands)) return result.pop().stdout;
      return _.map(result, 'stdout');
    })
    .catch(err => {
      _ssh.dispose();
      console.log(chalk.red(`Error in connection to ${name}.`));
      console.log(err);
      throw err;
    });
}

/**
 * SFTP a local file to or from a remote machine
 *
 * Switch this to use Promise.map
 **/
function scp(options = {}) {
  const {direction, hostname, localPath, remotePath, keyPath, username} = _.defaults(options, {
    'hostname': '',
    'username': 'ubuntu',
    'keyPath': '',
    'commands': ''
  });
  const keyClause = keyPath ? `-i ${keyPath}` : '';
  const scpCmd = `scp ${SSH_OPTS} ${keyClause}`;
  const remoteUrl = `${username}@${hostname}:${remotePath}`;
  let command;
  if (direction) {
    // SCP to a remote machine (upload)
    // console.log(`Uploading ${localPath} to ${remoteUrl}`.blue);
    const stat = fs.statSync(localPath);
    if (!stat.isFile() && !stat.isDirectory()) {
      throw new Error(`Invalid localPath supplied: ${localPath}`);
    }
    command = `${scpCmd} ${stat.isDirectory() ? '-r' : ''} ${localPath} ${remoteUrl}`;
  } else {
    // SCP from a remote machine (download)
    // console.log(`Downloading ${remoteUrl} to ${localPath}`.blue);
    command = `${scpCmd} ${remoteUrl} ${localPath}`;
  }
  const silentCommand = `${command} 1>/dev/null 2>/dev/null`;
  return cmd(silentCommand)
    .catch(err => {
      console.log('Received scp error, trying again...'.red);
      return cmd(silentCommand);
    });
}

scp.up = function(options = {}) {
  return scp(_.defaults(options, {
    'direction': 1,
    'username': 'ubuntu'
  }));
};

scp.down = function(options = {}) {
  return scp(_.defaults(options, {
    'direction': 0,
    'username': 'ubuntu'
  }));
};

function urlToIp(url) {
  return new Promise((resolve, reject) => {
    const parsed = URL.parse(url);
    const lookup = parsed.hostname || parsed.path;
    if (!lookup) throw new Error(`Unable to parse URL: ${url}`);
    DNS.lookup(lookup, (err, address) => {
      if (err) return reject(err);
      if (!address) return reject(new Error(`Unable to resolve URL: ${url}`));
      resolve(address);
    });
  });
}

function read(path, encoding = 'utf8') {
  return Promise.resolve()
    .then(() => {
      // if (process.stdout.isTTY) return fs.readFileSync(path, encoding);
      return new Promise((resolve, reject) => {
        fs.readFile(path, encoding, (err, data) => {
          if (err) reject(err);
          else resolve(data);
        });
      });
    })
    .then(string => _.trimEnd(string, `\n`));
}

function tmpname() {
  return `.${uuid.v4()}.tmp`;
}

module.exports = {cmd, ssh, scp, urlToIp, read, tmpname, pwd};
