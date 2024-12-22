// load-balancer.ts
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import {
  aws_ec2 as ec2,
  aws_ecs as ecs,
  aws_ecr as ecr,
  aws_events as events,
  aws_events_targets as targets,
  aws_lambda as lambda,
  aws_events_targets as eventTargets,
  aws_iam as iam,
  custom_resources as cr,
} from "aws-cdk-lib";
import { Construct } from "constructs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Protocol } from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { v4 as uuidv4 } from "uuid";

export interface LoadBalancerProps {
  vpc: ec2.Vpc;
  clusterService: ecs.BaseService;
  containerDefinition: ecs.ContainerDefinition
  stackName: string;
  quantumServerPort: number;

}

export class QuantumServerClientServiceLoadBalancer extends Construct {
  public readonly nlb: elbv2.NetworkLoadBalancer;
  constructor(scope: Construct, id: string, props: LoadBalancerProps) {
  
    super(scope, id);

    this.nlb = new elbv2.NetworkLoadBalancer(this, "MyNlb", {
      vpc: props.vpc,
      internetFacing: true,
    });

    // Create Lambda Layer from the deployed S3 artifact
    const deployContainerLambdaLayer = new lambda.LayerVersion(
      this,
      "LambdaLayer",
      {
        code: lambda.Code.fromAsset(
          "lambda/deploy-self-signed-certificate/layer"
        ),
        compatibleRuntimes: [lambda.Runtime.NODEJS_20_X],
      }
    );

    const generateCertificateLambda = new lambda.Function(
      this,
      "DeploySelfSignedCertificate",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset(
          "lambda/deploy-self-signed-certificate/code"
        ),
        timeout: cdk.Duration.minutes(5),
        layers: [deployContainerLambdaLayer],
        environment: {
          CERTIFICATE_NAME: `${props.stackName}.local.com`,
        },
      }
    );

    const deleteCertificateLambda = new lambda.Function(
      this,
      "DeleteSelfSignedCertificate",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset("lambda/delete-self-signed-certificate"),
        timeout: cdk.Duration.minutes(5),
        environment: {
          CERTIFICATE_NAME: `${props.stackName}.local.com`,
        },
      }
    );

    generateCertificateLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "acm:ListCertificates",
          "acm:ListTagsForCertificate",
          "acm:DeleteCertificate",
          "acm:ImportCertificate",
        ],
        resources: ["*"], // Change to specific resources if necessary
      })
    );

    deleteCertificateLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["acm:DeleteCertificate"],
        resources: ["*"], // Or limit to specific resources if possible
      })
    );

    // Create a Custom Resource to generate and sign the certificate
    const generateCertificateCustomResource = new cr.AwsCustomResource(
      this,
      "GenerateCertificateCustomResource",
      {
        onCreate: {
          service: "Lambda",
          action: "invoke",
          parameters: {
            FunctionName: generateCertificateLambda.functionName,
            InvocationType: "RequestResponse",
          },
          physicalResourceId: cr.PhysicalResourceId.of(uuidv4()),
        },
        onUpdate: {
          service: "Lambda",
          action: "invoke",
          parameters: {
            FunctionName: generateCertificateLambda.functionName,
            InvocationType: "RequestResponse",
          },
          physicalResourceId: cr.PhysicalResourceId.of(uuidv4()),
        },
        onDelete: {
          service: "Lambda",
          action: "invoke",
          parameters: {
            FunctionName: deleteCertificateLambda.functionName,
            InvocationType: "RequestResponse",
          },
          physicalResourceId: cr.PhysicalResourceId.of(uuidv4()),
        },
        policy: cr.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            actions: ["lambda:InvokeFunction"],
            resources: [
              generateCertificateLambda.functionArn,
              deleteCertificateLambda.functionArn,
            ],
          }),
        ]),
      }
    );


    const certificateArn =
      generateCertificateCustomResource.getResponseField("Payload");

      const listenerHttps = this.nlb.addListener("MyTlsListener", {
        port: 443,
        protocol: Protocol.TLS, // TLS protocol
        certificates: [elbv2.ListenerCertificate.fromArn(cdk.Fn.select(1, cdk.Fn.split('"', certificateArn)))],
      });
      const listenerHttp = this.nlb.addListener("MyTcpListener", {
        port: 80,
        protocol: Protocol.TCP, // TLS protocol
      });
  
      // Ensure the listener waits for the certificate creation
      listenerHttps.node.addDependency(generateCertificateCustomResource);
  
      // Attach the ECS service as the target group for the listener
      listenerHttps.addTargets("EcsTargetsTLS", {
        protocol: Protocol.TCP,
        port: props.quantumServerPort, // The port the service listens on
        targets: [props.clusterService.loadBalancerTarget(props.containerDefinition)],
      });

      listenerHttp.addTargets("EcsTargetsTCP", {
        protocol: Protocol.TCP,
        port: props.quantumServerPort, // The port the service listens on
        targets: [props.clusterService.loadBalancerTarget(props.containerDefinition)],
      });
  }
}
