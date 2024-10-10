#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { QuantumServerInfrastructure } from '../lib/main-stack';
import { ReactAppStack1 } from '../lib/test-stack';


const app = new cdk.App({
  
});
new QuantumServerInfrastructure(app, 'simple-app-stack-1', {
    env: {
      region: 'eu-central-1'
    },
    stackConfig: {
    stackName: "simple-app-stack-1",
    vpcCidr: "10.0.0.0/16",
    // ecrRepository: "simple-server-prod",
    quantumServerPort: 3005,
    containerCpu: 256,
    containerMemoryLimitMiB: 512,
    desiredContainerCount: 1,
  },
});


// new ReactAppStack1(app, 'qa-dashboard');