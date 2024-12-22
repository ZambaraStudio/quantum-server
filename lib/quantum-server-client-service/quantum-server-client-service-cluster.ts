// ecs.ts
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import * as logs from 'aws-cdk-lib/aws-logs';


import {
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_events as events,
  aws_events_targets as eventTargets,
} from "aws-cdk-lib";
import { QuantumServerCustomUtilsConstruct } from "../custom-utils/custom-utils";
export interface QuantumServerClusterProps {
  stackName: string;
  vpc: ec2.Vpc;
  securityGroup: ec2.SecurityGroup;
  quantumServerPort: number;
  containerCpu: number;
  containerMemoryLimitMiB: number;
  desiredContainerCount: number;
  redisEndpoint: string;
  redisPort: number;
  quantumServerCustomUtilsConstruct: QuantumServerCustomUtilsConstruct;
}

export class QuantumServerClientServiceCluster extends Construct {
  public readonly clusterService: ecs.FargateService;
  public readonly taskDefinition: ecs.FargateTaskDefinition;
  public readonly container: ecs.ContainerDefinition;

  constructor(scope: Construct, id: string, props: QuantumServerClusterProps) {
    super(scope, id);

    const logGroup = new logs.LogGroup(this, `${props.stackName}-ServerLogGroup`, {
      logGroupName: `/ecs/${props.stackName}-ServerLogGroup`,
      retention: logs.RetentionDays.ONE_WEEK, // Customize the retention period as needed
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Automatically remove logs when stack is deleted (optional)
    });

    const cluster = new ecs.Cluster(this, `${props.stackName}-QuantumServerCluster`, {
      vpc: props.vpc,
      clusterName: `${props.stackName}-quantum-server-cluster`,

    });

    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      `${props.stackName}-ServerTaskDef`,
      {
        cpu: props.containerCpu,
        memoryLimitMiB: props.containerMemoryLimitMiB,
      }
    );

    this.container = taskDefinition.addContainer(
      `${props.stackName}-ServerClientServiceContainer`,
      {
        image: ecs.ContainerImage.fromRegistry(
          "levansuper/quantum-server-client-service:latest"
        ),
        // image: ecs.ContainerImage.fromEcrRepository(ecrRepository, 'latest'),
        portMappings: [{ containerPort: props.quantumServerPort }],
        environment: {
          REDIS_HOST: props.redisEndpoint,
          REDIS_PORT: props.redisPort.toString(),
          API_PORT: props.quantumServerPort.toString(),
          AUTHENTICATION_LAMBDA_ARN: props.quantumServerCustomUtilsConstruct.utilLambdas["userAuthenticationLambda"].functionArn

        },
        logging: ecs.LogDrivers.awsLogs({
          streamPrefix: `${props.stackName}`,
          logGroup, // Associate the log group created above
        }),
      }
    );

    this.clusterService = new ecs.FargateService(
      this,
      `${props.stackName}-ServerService`,
      {
        cluster,
        taskDefinition,
        desiredCount: props.desiredContainerCount,
        securityGroups: [props.securityGroup],
        assignPublicIp: true,
      }
    );
  }
}
