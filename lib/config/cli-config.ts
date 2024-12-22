import * as cdk from "aws-cdk-lib";
import {
  aws_lambda as lambda,
} from "aws-cdk-lib";



export type QuantumLambdaConfig = {
  lambdaName: string;
  codePath: string;
  runtime?: lambda.Runtime;
  timeout?: number;
  env?: {
    [key: string]: string;
  };
};

export type QuantumServerEnvConfig = Omit<cdk.Environment, "account">;
export type QuantumServerClientServiceConfig = {
  containerCpu: number;
  containerMemoryLimitMiB: number;
  desiredContainerCount: number;
};

export type QuantumServerWorkerServiceConfig = {
  containerCpu: number;
  containerMemoryLimitMiB: number;
  desiredContainerCount: number;
};

export type QuantumServerCustomUtils = {
  [key: string]: QuantumLambdaConfig;
};

export type QuantumServerConfig = {
  env: QuantumServerEnvConfig;
  stackName: string;
  clientService: QuantumServerClientServiceConfig;
  workerService: QuantumServerWorkerServiceConfig;
  customUtils: QuantumServerCustomUtils;
};

export type QuantumServerStackProps = cdk.StackProps & QuantumServerConfig;
