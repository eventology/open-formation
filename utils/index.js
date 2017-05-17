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

function connect(options = {}) {
  const _ssh = new NodeSSH();
  const maxCount = 7;
  let count = 0;
  const name = `${options.username}@${options.host}`;
  console.log(chalk.blue(`Connecting to ${name}`));
  const _connect = () => _ssh.connect(options)
    .catch(err => {
      if (++count > maxCount) throw err;
      console.log(chalk.yellow(`Error connecting to ${name}, retrying. (${count} / ${maxCount})`));
      return new Promise(r => setTimeout(r, 8000))
        .then(() => _connect());
    })
    .then(() => _ssh);
  return _connect();
}

function disconnect(_ssh = {}) {
  if (!_.isFunction(_ssh.dispose)) throw new Error('Invalid ssh handle supplied');
  const name = `${_.get(_ssh, 'connection.config.username')}@${_.get(_ssh, 'connection.config.host')}`;
  console.log(chalk.blue(`Disconnecting from ${name}`));
  return _ssh.dispose();
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

  const cmds = _.chain([commands])
    .flatten(commands)
    .map(v => _.trim(v))
    .compact()
    .value();
  if (!cmds.length) return Promise.resolve('');

  let _ssh;
  return connect({
    'host': hostname,
    'username': username,
    'privateKey': keyPath
  })
    // Execute cmds in a serial queued
    .then(__ssh => {
      _ssh = __ssh;
      return Promise.map(cmds, _cmd => {
        console.log(chalk.cyan(`${name}: ${_cmd}`));
        return _ssh.execCommand(_cmd);
      });
    })
    .then(result => {
      disconnect(_ssh);
      if (!_.isArray(commands)) return result.pop().stdout;
      return _.map(result, 'stdout');
    })
    .catch(err => {
      console.log(chalk.red(`Error in connection to ${name}.`));
      console.log(err);
      disconnect(_ssh);
      throw err;
    });
}

/**
 * SFTP a local file to or from a remote machine
 *
 * Switch this to use Promise.map
 **/
function scp(options = {}) {
  const {direction, host, localPath, remotePath, privateKey, username} = _.defaults(options, {
    'host': '',
    'username': 'ubuntu',
    'keyPath': '',
    'commands': ''
  });
  let _ssh;
  return connect({host, username, privateKey})
    .then(__ssh => {
      _ssh = __ssh;
      if (direction) {
        // Uploading to a remote machine
        const stat = fs.statSync(localPath);
        if (!stat.isFile()) {
          throw new Error(`Invalid localPath supplied: ${localPath}. Directories are not supported.`);
        }
        return _ssh.putFile(localPath, remotePath);
      } else {
        return _ssh.getFile(localPath, remotePath);
      }
    })
    .then(result => {
      disconnect(_ssh);
      return result;
    })
    .catch(err => {
      console.log(chalk.red(`Error in SCP operation.`));
      console.log(err);
      disconnect(_ssh);
      throw err;
    });
}

scp.up = function(options = {}) {
  return scp(_.assign(options, {
    'direction': 1
  }));
};

scp.down = function(options = {}) {
  return scp(_.assign(options, {
    'direction': 0
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
