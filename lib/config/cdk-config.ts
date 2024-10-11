import * as cdk from "aws-cdk-lib";
import {
  QuantumServerConfig,
  QuantumServerClientServiceConfig,
} from "./cli-config";

export type CDKQuantumServerClientServiceConfig =
  QuantumServerClientServiceConfig & {
    port: number;
  };

export type CDKVPCConfig = {
  vpcCidr: "10.0.0.0/16";
};

export type CDKQuantumServerConfig = Omit<
  QuantumServerConfig,
  "clientService"
> & {
  clientService: CDKQuantumServerClientServiceConfig;
  vpc: CDKVPCConfig;
};

export const defaultCDKQuantumServerConfig: CDKQuantumServerConfig = {
  env: {
    region: "us-east-1",
  },
  vpc: {
    vpcCidr: "10.0.0.0/16",
  },
  stackName: "simple-app-stack",
  clientService: {
    port: 3005,
    containerCpu: 256,
    containerMemoryLimitMiB: 512,
    desiredContainerCount: 1,
  },
  workerService: {
    containerCpu: 256,
    containerMemoryLimitMiB: 512,
    desiredContainerCount: 1,
  }
};
