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

![image](/uploads/636e3d157dbc85693c379649080a437c/image.png)

`ofn deploy [-y]`
- Deploy the machines in the current formation.

`ofn rm <instanceId>`
- Terminate an EC2 instance.

`ofn help`
- Full helptext

![image](/uploads/c06e65f9f0df6b560b89164e662fa3d2/image.png)


## TODO
  * yaml support - #5
  * formation.json documentation - #4
