[![CircleCI](https://circleci.com/gh/eventology/open-formation.svg?style=shield)](https://circleci.com/gh/eventology/open-formation)
[![npm](https://img.shields.io/npm/v/@cosmunity/open-formation.svg)](https://www.npmjs.com/package/@cosmunity/open-formation)
[![npm](https://img.shields.io/npm/l/express.svg)](https://github.com/eventology/open-formation/blob/master/LICENSE) [![Greenkeeper badge](https://badges.greenkeeper.io/eventology/open-formation.svg)](https://greenkeeper.io/)

# open-formation
A cli tool for deploying AWS resources using a JSON file.


## Install
Install using `npm install -g @cosmunity/open-formation`. 

You must be logged into an account with access to the `@cosmunity` package scope.

## Running
open-formation looks for a file in the cwd named `formation.json`.

## Commands

`ofn`
- Enter the interactive ofn shell.
- All below commands can be executed here without typing ofn.

`ofn version <service-name>`
- This command deploys the specified ECS service.
- ECS will deploy a new version of the service and handle any scaling operations automatically.
- Instances will be automatically registered in the target load balancer.
- Removed instances will be drained before termination.

`ofn status`
- Print status information about the current formation.

![image](https://user-images.githubusercontent.com/631020/42429341-0e60103e-82fe-11e8-8708-d4c8a957129b.png)

`ofn deploy [-y]`
- Deploy the machines in the current formation.

`ofn rm <instanceId>`
- Terminate an EC2 instance.

`ofn help`
- Full helptext

![image](https://user-images.githubusercontent.com/631020/42429355-1f0a5a8e-82fe-11e8-9031-91dcb616d11d.png)
