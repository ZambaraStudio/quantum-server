#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import * as deepmerge from 'deepmerge';
import { QuantumServerInfrastructure } from '../lib/main-stack';
import { QuantumServerConfig } from '../lib/config/cli-config';
import { CDKQuantumServerConfig, defaultCDKQuantumServerConfig } from '../lib/config/cdk-config';



const app = new cdk.App({
  
});
const quantumConfig = app.node.tryGetContext('quantumConfig');
const quantumServerConfig: QuantumServerConfig  = JSON.parse(quantumConfig);


const config = deepmerge(defaultCDKQuantumServerConfig, quantumServerConfig) as CDKQuantumServerConfig;

new QuantumServerInfrastructure(app, config.stackName, config);
