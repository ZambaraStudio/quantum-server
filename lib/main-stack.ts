// main-stack.ts
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { VpcConstruct } from "./vpc";
import { QuantumServerClientServiceCluster } from "./quantum-server-client-service/quantum-server-client-service-cluster";
import { QuantumServerClientServiceLoadBalancer } from "./quantum-server-client-service/quantum-server-client-service-load-balancer";
import { RedisConstruct } from "./redis";
import { QuantumWorkerCluster } from "./quantum-worker/quantum-worker-cluster";
import { QuantumDashboard } from "./quantum-dashboard/quantum-dashboard";
import { CDKQuantumServerConfig } from "./config/cdk-config";
import { QuantumServerCustomUtilsConstruct } from "./custom-utils/custom-utils";

export class QuantumServerInfrastructure extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CDKQuantumServerConfig) {
    super(scope, id, props);

    const quantumServerCustomUtilsConstruct =
      new QuantumServerCustomUtilsConstruct(
        this,
        "QuantumServerCustomUtilsConstruct",
        {
          stackName: props.stackName,
          quantumServerCustomUtils: props.customUtils,
        }
      );

    const vpcConstruct = new VpcConstruct(this, "VpcConstruct", {
      stackName: props.stackName,
      vpcCidr: props.vpc.vpcCidr,
      quantumServerPort: props.clientService.port,
    });

    const redis = new RedisConstruct(this, "RedisConstruct", {
      vpc: vpcConstruct.vpc,
    });

    redis.node.addDependency(vpcConstruct);

    const quantumDashboard = new QuantumDashboard(this, "dashboard", {
      redisEndpoint: redis.redisEndpoint,
      redisPort: redis.redisPort,
      stackName: props.stackName,
      vpc: vpcConstruct.vpc,
    });

    const quantumServerClientServiceCluster =
      new QuantumServerClientServiceCluster(
        this,
        "QuantumServerClientServiceCluster",
        {
          stackName: props.stackName,
          vpc: vpcConstruct.vpc,
          securityGroup: vpcConstruct.securityGroup,
          quantumServerPort: props.clientService.port,
          containerCpu: props.clientService.containerCpu,
          containerMemoryLimitMiB: props.clientService.containerMemoryLimitMiB,
          desiredContainerCount: props.clientService.desiredContainerCount,
          redisEndpoint: redis.redisEndpoint,
          redisPort: redis.redisPort,
          quantumServerCustomUtilsConstruct: quantumServerCustomUtilsConstruct,
        }
      );
    quantumServerClientServiceCluster.node.addDependency(redis);

    const quantumWorkerCluster = new QuantumWorkerCluster(
      this,
      "QuantumWorkerCluster",
      {
        stackName: props.stackName,
        vpc: vpcConstruct.vpc,
        containerCpu: props.workerService.containerCpu,
        containerMemoryLimitMiB: props.workerService.containerMemoryLimitMiB,
        desiredContainerCount: props.workerService.desiredContainerCount,
        redisEndpoint: redis.redisEndpoint,
        redisPort: redis.redisPort,
        gameBuildBucket: quantumDashboard.gameBuildBucket,
      }
    );
    quantumWorkerCluster.node.addDependency(redis);

    const quantumServerLoadBalancer =
      new QuantumServerClientServiceLoadBalancer(
        this,
        "QuantumServerClientServiceLoadBalancer",
        {
          stackName: props.stackName,
          clusterService: quantumServerClientServiceCluster.clusterService,
          containerDefinition: quantumServerClientServiceCluster.container,
          vpc: vpcConstruct.vpc,
          quantumServerPort: props.clientService.port,
        }
      );

    new cdk.CfnOutput(this, "load-balancer", {
      value: quantumServerLoadBalancer.nlb.loadBalancerDnsName,
    });
    new cdk.CfnOutput(this, "dashboard-url", {
      value: quantumDashboard.cloudfrontDistribution.domainName,
    });
    Object.keys(quantumServerCustomUtilsConstruct.utilLambdas).forEach(key => {
      new cdk.CfnOutput(this, `util-lambda-${key}`, {
        value: quantumServerCustomUtilsConstruct.utilLambdas[key].functionArn,
      });
    });
  }
}
