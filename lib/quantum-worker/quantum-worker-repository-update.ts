// ecs.ts
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
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
  aws_codebuild as codebuild,
  aws_sns as sns,
} from "aws-cdk-lib";
import * as sns_subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";

export interface QuantumServerClusterProps {
  repositoryName: string;
  bucketName: string;
}

export class QuantumWorkerRepositoryUpdate extends Construct {
  constructor(scope: Construct, id: string, props: QuantumServerClusterProps) {
    super(scope, id);

    // Step 1: Reference the existing S3 bucket by name
    const bucket = s3.Bucket.fromBucketName(
      this,
      "SourceBucket",
      props.bucketName
    );

    // Step 2: Reference the existing ECR repository by name
    const repository = ecr.Repository.fromRepositoryName(
      this,
      "ECRRepo",
      props.repositoryName
    );

    // IAM Role for CodeBuild
    const codeBuildRole = new iam.Role(this, "CodeBuildServiceRole", {
      assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
    });

    codeBuildRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetAuthorizationToken",  // For ECR login
          "ecr:InitiateLayerUpload",    // Missing permission for uploading layers
          "ecr:UploadLayerPart",        // Required for uploading layer parts
          "ecr:CompleteLayerUpload",    // Completing the layer upload
          "ecr:PutImage",               // Pushing the Docker image to ECR
        ],
        resources: ["*"], // You can restrict to specific ECR resources
      })
    );

    // Define a CodeBuild project to build and push a Docker image
    const codeBuildProject = new codebuild.Project(this, "CodeBuildProject", {
      source: codebuild.Source.s3({
        bucket,
        path: "Archive.zip", // Placeholder for the actual source
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
        privileged: true, // Required to run Docker
      },
      environmentVariables: {
        ECR_REPO_URI: { value: repository.repositoryUri },
        REPO_NAME: { value: repository.repositoryName },
      },
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: {
          install: {
            commands: [
              "echo Installing dependencies...",
              // Any specific dependencies can be added here
            ],
          },
          pre_build: {
            commands: [
              "echo Logging in to Amazon ECR...",
            ],
          },
          build: {
            commands: [
              "echo Building the Docker image with a temporary tag...",
              "TEMP_TAG=$(date +%s)", // Unique temporary tag using the current timestamp
              `docker login -u levansuper -p dckr_pat_8RyRzwPeM4BnTRdVlOgZ4Y-jlrk`, // Login to Dockerhub
              "docker build -t game-worker:latest .",
              "docker logout",
            
            ],
          },
          post_build: {
            commands: [
              "aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $ECR_REPO_URI",
              "docker tag game-worker:latest $ECR_REPO_URI:latest",
              "docker push $ECR_REPO_URI:latest"
            ],
          },
        },
        artifacts: {
          files: ["**/*"], // Output artifacts
        },
      }),
      role: codeBuildRole,
    });

    // IAM Role for Lambda
    const lambdaExecutionRole = new iam.Role(this, "LambdaExecutionRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });

    lambdaExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "codebuild:UpdateProject",
          "codebuild:StartBuild",
          "codebuild:BatchGetProjects",
        ],
        resources: [codeBuildProject.projectArn],
      })
    );

    // Lambda function to trigger CodeBuild
    const triggerCodeBuildLambda = new lambda.Function(
      this,
      "TriggerCodeBuildLambda",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset("lambda/run-new-version-codebuild"),
        environment: {
          PROJECT_NAME: codeBuildProject.projectName,
        },
        role: lambdaExecutionRole,
      }
    );

    // Add S3 event notification to trigger Lambda on object creation
    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(triggerCodeBuildLambda)
    );
  }
}
