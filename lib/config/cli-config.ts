
import * as cdk from 'aws-cdk-lib';

export type QuantumServerEnvConfig = Omit<cdk.Environment, 'account'>
export type QuantumServerClientServiceConfig = {
  containerCpu: number,
  containerMemoryLimitMiB: number,
  desiredContainerCount: number,
}

export type QuantumServerWorkerServiceConfig = {
  containerCpu: number,
  containerMemoryLimitMiB: number,
  desiredContainerCount: number,
}

export type QuantumServerConfig = {
  env: QuantumServerEnvConfig,
  stackName: string,
  clientService: QuantumServerClientServiceConfig
  workerService: QuantumServerWorkerServiceConfig
}

export type QuantumServerStackProps = cdk.StackProps  & QuantumServerConfig
