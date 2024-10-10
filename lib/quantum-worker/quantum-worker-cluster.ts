// ecs.ts
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as logs from "aws-cdk-lib/aws-logs";
import {
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_events as events,
  aws_events_targets as eventTargets,
  aws_ecr as ecr,
  aws_events_targets as targets,
  aws_lambda as lambda,
  custom_resources as cr,
  aws_s3 as s3,
} from "aws-cdk-lib";
import { QuantumWorkerRepository } from "./quantum-worker-repositoy";
import { QuantumWorkerRepositoryUpdate } from "./quantum-worker-repository-update";

export interface QuantumServerClusterProps {
  stackName: string;
  vpc: ec2.Vpc;
  containerCpu: number;
  containerMemoryLimitMiB: number;
  desiredContainerCount: number;
  redisEndpoint: string;
  redisPort: number;
  gameBuildBucket: s3.Bucket;
}

export class QuantumWorkerCluster extends Construct {
  public readonly clusterService: ecs.FargateService;
  public readonly taskDefinition: ecs.FargateTaskDefinition;
  public readonly container: ecs.ContainerDefinition;

  constructor(scope: Construct, id: string, props: QuantumServerClusterProps) {
    super(scope, id);

    const logGroup = new logs.LogGroup(
      this,
      `${props.stackName}-WorkerLogGroup`,
      {
        logGroupName: `/ecs/${props.stackName}-WorkerLogGroup`,
        retention: logs.RetentionDays.ONE_WEEK, // Customize the retention period as needed
        removalPolicy: cdk.RemovalPolicy.DESTROY, // Automatically remove logs when stack is deleted (optional)
      }
    );
    const cluster = new ecs.Cluster(
      this,
      `${props.stackName}-GameServerCluster`,
      {
        vpc: props.vpc,
        clusterName: `${props.stackName}-game-server-cluster`,
      }
    );

    // Define the task definition
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      `${props.stackName}-TaskDef`,
      {
        cpu: props.containerCpu,
        memoryLimitMiB: props.containerMemoryLimitMiB,
      }
    );

    const repositoryConstruct = new QuantumWorkerRepository(this, id, {
      dockerHubImage: "levansuper/quantum-game-server-initial",
      stackName: props.stackName,
    });

    new QuantumWorkerRepositoryUpdate(this, "QuantumWorkerRepositoryUpdate", {
      repositoryName: repositoryConstruct.repository.repositoryName,
      bucketName: props.gameBuildBucket.bucketName,
    });

    // Add container to the task definition
    const container = taskDefinition.addContainer(
      `${props.stackName}-Container`,
      {
        image: ecs.ContainerImage.fromEcrRepository(
          repositoryConstruct.repository,
          "latest"
        ),
        containerName: `${props.stackName}-container`,
        logging: ecs.LogDrivers.awsLogs({
          streamPrefix: `${props.stackName}-quantum-game-server`,
          logGroup, // Associate the log group created above
        }),
        environment: {
          REDIS_HOST: props.redisEndpoint,
          REDIS_PORT: props.redisPort.toString(),
          LOOP_RATE: "30",
        },
      }
    );

    container.node.addDependency(repositoryConstruct);

    // Create a Fargate service
    const fargateService = new ecs.FargateService(
      this,
      `${props.stackName}-Service`,
      {
        cluster,
        taskDefinition,
        desiredCount: props.desiredContainerCount,
        assignPublicIp: true, // Assign public IP to allow direct access
        serviceName: `${props.stackName}-service`,
      }
    );

    // Create a Lambda function that will update the ECS service
    const updateEcsServiceLambda = new lambda.Function(
      this,
      "UpdateEcsServiceLambda",
      {
        functionName: `${props.stackName}-deploy-new-container`,
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset("lambda/deploy-new-container"),
        environment: {
          CLUSTER_NAME: cluster.clusterName,
          SERVICE_NAME: fargateService.serviceName,
        },
      }
    );

    // Grant permissions to the Lambda function to update the ECS service
    updateEcsServiceLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ecs:UpdateService"],
        resources: [fargateService.serviceArn],
      })
    );

    // Set up EventBridge rule to trigger ECS deployment on image push
    const imagePushRule = new events.Rule(
      this,
      `${props.stackName}-ImagePushRule`,
      {
        ruleName: `${props.stackName}-image-push-rule`,
        eventPattern: {
          source: ["aws.ecr"],
          detailType: ["ECR Image Action"],
          detail: {
            "action-type": ["PUSH"],
            "repository-name": [repositoryConstruct.repository.repositoryName],
          },
        },
      }
    );

    imagePushRule.addTarget(
      new eventTargets.LambdaFunction(updateEcsServiceLambda)
    );
  }
}
