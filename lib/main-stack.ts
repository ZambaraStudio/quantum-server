// main-stack.ts
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { VpcConstruct } from './vpc';
import { QuantumServerClientServiceCluster } from './quantum-server-client-service/quantum-server-client-service-cluster';
import { QuantumServerClientServiceLoadBalancer } from './quantum-server-client-service/quantum-server-client-service-load-balancer';
import { RedisConstruct } from './redis';
import { QuantumWorkerCluster } from './quantum-worker/quantum-worker-cluster';
import { QuantumWorkerRepository } from './quantum-worker/quantum-worker-repositoy';
import { QuantumDashboard } from './quantum-dashboard/quantum-dashboard';
import { QuantumWorkerRepositoryUpdate } from './quantum-worker/quantum-worker-repository-update';


export interface QuantumServerStackProps extends cdk.StackProps {
  stackConfig: {
    stackName: string;
    vpcCidr: string;
    quantumServerPort: number;
    containerCpu: number;
    containerMemoryLimitMiB: number;
    desiredContainerCount: number;
  };
}

export class QuantumServerInfrastructure extends cdk.Stack {
  constructor(scope: Construct, id: string, props: QuantumServerStackProps) {
    super(scope, id, props);

    const vpcConstruct = new VpcConstruct(this, 'VpcConstruct', {
      stackName: props.stackConfig.stackName,
      vpcCidr: props.stackConfig.vpcCidr,
      quantumServerPort: props.stackConfig.quantumServerPort
    });

    // const redis = new RedisConstruct(this, 'RedisConstruct', {
    //   vpc: vpcConstruct.vpc,
    // });

    // redis.node.addDependency(vpcConstruct);


    const quantumDashboard = new QuantumDashboard(this, 'dashboard', {
      // redisEndpoint: redis.redisEndpoint,
      // redisPort: redis.redisPort,
      stackName: props.stackConfig.stackName,
      vpc: vpcConstruct.vpc,
    })

    // const quantumServerCluster = new QuantumServerCluster(this, 'QuantumServerCluster', {
    //   stackName: props.stackConfig.stackName,
    //   vpc: vpcConstruct.vpc,
    //   securityGroup: vpcConstruct.securityGroup,
    //   quantumServerPort: props.stackConfig.quantumServerPort,
    //   containerCpu: props.stackConfig.containerCpu,
    //   containerMemoryLimitMiB: props.stackConfig.containerMemoryLimitMiB,
    //   desiredContainerCount: props.stackConfig.desiredContainerCount,
    //   redisEndpoint: redis.redisEndpoint,
    //   redisPort: redis.redisPort
    // });
    // quantumServerCluster.node.addDependency(redis);

    // const quantumWorkerCluster = new QuantumWorkerCluster(this, 'QuantumWorkerCluster', {
    //   stackName: props.stackConfig.stackName,
    //   vpc: vpcConstruct.vpc,
    //   containerCpu: props.stackConfig.containerCpu,
    //   containerMemoryLimitMiB: props.stackConfig.containerMemoryLimitMiB,
    //   desiredContainerCount: props.stackConfig.desiredContainerCount,
    //   redisEndpoint: redis.redisEndpoint,
    //   redisPort: redis.redisPort,
    //   gameBuildBucket: quantumDashboard.gameBuildBucket
    // });
    // quantumWorkerCluster.node.addDependency(redis);

    // const quantumServerLoadBalancer = new QuantumServerLoadBalancer(this, 'QuantumServerLoadBalancer', {
    //   stackName: props.stackConfig.stackName,
    //   clusterService: quantumServerCluster.clusterService,
    //   containerDefinition: quantumServerCluster.container,
    //   vpc: vpcConstruct.vpc,
    //   quantumServerPort: props.stackConfig.quantumServerPort
    // });

    // new cdk.CfnOutput(this, "NlbDns", {
    //   value: quantumServerLoadBalancer.nlb.loadBalancerDnsName,
    // });
  }
}
