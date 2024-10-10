import * as cdk from "aws-cdk-lib";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import * as cr from "aws-cdk-lib/custom-resources";

interface DockerHubToEcrProps {
  stackName: string;
  dockerHubImage: string; // Docker Hub image (e.g., "nginx:latest")
}

export class QuantumWorkerRepository extends Construct {
  public readonly repository: cdk.aws_ecr.Repository;
  constructor(scope: Construct, id: string, props: DockerHubToEcrProps) {
    super(scope, id);

    // Create an ECR repository
    this.repository = new ecr.Repository(
      this,
      `${props.stackName}-ECRRepository`,
      {
        repositoryName: `${props.stackName}-game-server-repository`,
        autoDeleteImages: true,
        removalPolicy:cdk.RemovalPolicy.DESTROY,
      }
    );

    // Create a CodeBuild project to pull an image from DockerHub and push to ECR
    const buildProject = new codebuild.Project(
      this,
      `${props.stackName}-InitialDockerHubToECRBuildProject`,
      {
        environment: {
          buildImage: codebuild.LinuxBuildImage.STANDARD_5_0,
          privileged: true, // To allow Docker commands in CodeBuild
        },
        buildSpec: codebuild.BuildSpec.fromObject({
          version: "0.2",
          phases: {
            pre_build: {
              commands: [
                "echo Logging in to Amazon ECR...",
                `echo Pulling image from DockerHub: ${props.dockerHubImage}`,
                `docker login -u levansuper -p dckr_pat_8RyRzwPeM4BnTRdVlOgZ4Y-jlrk`, // Login to Dockerhub
                `docker pull ${props.dockerHubImage}`, // Pull the DockerHub image
                `docker tag ${props.dockerHubImage} ${this.repository.repositoryUri}:latest`, // Tag the DockerHub image for ECR
              ],
            },
            build: {
              commands: [
                "echo Pushing the Docker image to ECR...",
                `aws ecr get-login-password --region ${
                  cdk.Stack.of(this).region
                } | docker login --username AWS --password-stdin ${
                  this.repository.repositoryUri
                }`,
                `docker push ${this.repository.repositoryUri}:latest`, // Push image to ECR
              ],
            },
          },
        }),
      }
    );

    // Grant CodeBuild permissions to pull/push from ECR
    this.repository.grantPullPush(buildProject);

    // Allow CodeBuild to get an ECR authorization token
    buildProject.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ecr:GetAuthorizationToken"],
        resources: ["*"],
      })
    );

    // Use AwsCustomResource to trigger CodeBuild during CDK deployment
    const triggerBuild = new cr.AwsCustomResource(
      this,
      `${props.stackName}-TriggerInitialDockerHubToECRBuildProjectBuild`,
      {
        onCreate: {
          service: "CodeBuild",
          action: "startBuild",
          parameters: {
            projectName: buildProject.projectName,
          },
          physicalResourceId: cr.PhysicalResourceId.of(
            `${props.stackName}-InitialDockerHubToECRBuildProjectOnCreateTrigger`
          ), // Ensures the resource is unique
        },
        onUpdate: {
          service: "CodeBuild",
          action: "startBuild",
          parameters: {
            projectName: buildProject.projectName,
          },
          physicalResourceId: cr.PhysicalResourceId.of(
            `${props.stackName}-InitialDockerHubToECRBuildProjectOnUpdateTrigger`
          ), // Ensures the resource is unique
        },
        policy: cr.AwsCustomResourcePolicy.fromStatements([
          new iam.PolicyStatement({
            actions: ["codebuild:StartBuild"],
            resources: [buildProject.projectArn],
          }),
        ]),
      }
    );

    // Ensure the build project starts after the repository is created
    triggerBuild.node.addDependency(this.repository);
  }
}
