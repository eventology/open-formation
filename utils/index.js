'use strict';

const _ = require('lodash');
const {exec, execSync} = require('child_process');
const fs = require('fs');
const path = require('path');
const DNS = require('dns');
const URL = require('url');
const colors = require('colors');
const uuid = require('uuid');

const PRIVATE_KEY_PATH = path.join(__dirname, '../keys/cm.pem');
const SSH_OPTS = `-o UserKnownHostsFile=/dev/null -o StrictHostKeyChecking=no`;

/**
 * Function for executing shell commands synchronously
 *
 * @param {String|Array} command A single command, or an array of commands.
 * @returns {Array} Returns array containing results of commands
 **/
function cmd(commands) {
  return Promise.resolve()
    .then(() => {
      // Bind the options to the `execSync` call
      // Use unary to allow it to accept 1 arg and ignore all others
      const syncPromise = (...args) => Promise.resolve()
          .then(() => execSync(...args));

      const asyncPromise = (...args) => {
        return new Promise((resolve, reject) => {
          exec(...args, (err, stdout, stderr) => {
            if (err) reject(err);
            else resolve(stdout);
          });
        });
      };

      const executor = process.stdout.isTTY ? syncPromise : asyncPromise;
      const promises = _.chain([commands])
        .flatten()
      // Inherit stdio from current process so we can establish pseudo terminals
      // if necessary
        .map(command => executor(command, {
          'stdio': 'inherit'
        }))
        .value();
      if (_.isArray(promises)) return Promise.all(promises);
      return promises;
    });
}

function pwd() {
  return _.trimEnd(execSync('pwd').toString(), `\n`);
}

function ping(hostname, keyPath, username) {
  const testCmd = `ssh ${SSH_OPTS} -i ${keyPath} ${username}@${hostname} whoami 1>/dev/null 2>/dev/null && echo 0 || echo 1`;
  return cmd(`
    tries=0
    while [ $(${testCmd}) -eq 1 ]; do
      if [ $tries -eq 10 ]; then
        exit 1
      fi
      tries=$((tries+1))
      sleep 5
    done
    `);
}

/**
 * Run 1 or more commands on a remote machine
 *
 * Multiple commands will be grouped in single quotes. Single quotes in commands
 * will be escaped automatically
 **/
function ssh(hostname, commands, keyPath=PRIVATE_KEY_PATH, username='ubuntu') {
  console.log(`Connecting to ${username}@${hostname}`.blue);
  return ping(hostname, keyPath, username)
    .then(() => {
      // Base ssh command, -t creates a virtual terminal -i specifies keyfile path
      const sshCmd = `ssh ${SSH_OPTS} -ti ${keyPath} ${username}@${hostname}`;

      // Map commands into a single string joined by &&
      const command = _([commands]).flatten().map(command => {
        /**
         * Escape single quotes in commands using this strategy
         * https://stackoverflow.com/questions/1250079/how-to-escape-single-quotes-within-single-quoted-strings
         *
         * Example: echo 'string1';echo 'string2'
         * Escaped: echo '"'"'string1'"'"';echo '"'"'string2'"'"'
         *
         * This command can now be used in single quotes safely
         * > ssh user@remote 'echo '"'"'string1'"'"';echo '"'"'string2'"'"''
         * string1
         * string2
         *
         * This works because quotes without spaces are treated as a single string
         * echo 'bash'"is"'fun' = bashisfun
        **/
        return command.replace(/\'/g, `'"'"'`);
      }).join(';');

      // Run `commands` on `hostname` as `username`
      return cmd(`${sshCmd} '${command}'`);
    });
}

/**
 * SFTP a local file to or from a remote machine
 *
 * Directories are supported
 **/
function scp(options = {}) {
  const {direction, hostname, localPath, remotePath, keyPath, username} = options;
  const scpCmd = `scp ${SSH_OPTS} -i ${keyPath}`;
  const remoteUrl = `${username}@${hostname}:${remotePath}`;
  let command;
  if (direction) {
    // SCP to a remote machine (upload)
    console.log(`Uploading ${localPath} to ${remoteUrl}`.blue);
    const stat = fs.statSync(localPath);
    if (!stat.isFile() && !stat.isDirectory()) {
      throw new Error(`Invalid localPath supplied: ${localPath}`);
    }
    command = `${scpCmd} ${stat.isDirectory() ? '-r' : ''} ${localPath} ${remoteUrl}`;
  } else {
    // SCP from a remote machine (download)
    console.log(`Downloading ${remoteUrl} to ${localPath}`.blue);
    command = `${scpCmd} ${remoteUrl} ${localPath}`;
  }
  const silentCommand = `${command} 1>/dev/null 2>/dev/null`;
  return ping(hostname, keyPath, username)
    .then(() => cmd(silentCommand).catch(err => {
        console.log('Received scp error, trying again...'.red);
        return cmd(silentCommand);
      }));
}

scp.up = function(hostname, localPath, remotePath, keyPath=PRIVATE_KEY_PATH, username='ubuntu') {
  return scp({
    'direction': 1,
    hostname, localPath, remotePath, keyPath, username});
};

scp.down = function(hostname, remotePath, localPath, keyPath=PRIVATE_KEY_PATH, username='ubuntu') {
  return scp({
    'direction': 0,
    hostname, localPath, remotePath, keyPath, username});
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
      if (process.stdout.isTTY) return fs.readFileSync(path, encoding);
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
