import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { Construct } from "constructs";
import { BucketAccessControl } from "aws-cdk-lib/aws-s3";
import * as customResources from "aws-cdk-lib/custom-resources";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";


import {
  aws_ec2 as ec2,
  aws_lambda as lambda,
  aws_iam as iam,
  aws_s3_deployment as s3deploy
} from "aws-cdk-lib";


export interface QuantumServerClusterProps {
  stackName: string;
  //redisEndpoint: string;
  //redisPort: number;
  vpc: ec2.Vpc;
}

export class QuantumDashboard extends Construct {
  public readonly gameBuildBucket: s3.Bucket;
  constructor(scope: Construct, id: string, props: QuantumServerClusterProps) {
    super(scope, id);

    const quantumServerFileStorage = s3.Bucket.fromBucketAttributes(
      this,
      "ExistingBucket",
      {

        bucketName: "quantum-server-file-storage",
        // Optionally specify the bucket region here if needed
        bucketRegionalDomainName: 'quantum-server-file-storage.s3.us-east-1.amazonaws.com'
      }
      
    );

    const dashboardBucket = new s3.Bucket(this, `${props?.stackName}-DashboardBucket`, {
      publicReadAccess: true,
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "index.html", // For handling React Router
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      accessControl: BucketAccessControl.PRIVATE,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS,
    });

    this.gameBuildBucket = new s3.Bucket(this, `${props?.stackName}-GameBuildBucket`, {
      versioned: true, // Enable versioning
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Destroy the bucket when the stack is deleted
      autoDeleteObjects: true, // Automatically delete objects when the bucket is destroyed
      publicReadAccess: true,
      accessControl: BucketAccessControl.PRIVATE,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS,
    });

      // Create an S3 VPC Endpoint
      const s3Endpoint = new ec2.GatewayVpcEndpoint(this, 'S3VpcEndpoint', {
        vpc: props.vpc,
        service: ec2.GatewayVpcEndpointAwsService.S3,
      });


    const bucketDeployment = new s3deploy.BucketDeployment(this, "DeployDashboard", {
      sources: [
        s3deploy.Source.bucket(
          quantumServerFileStorage,
          "quantum-server-infranstucture-dashboard-frontend.zip"
        ),
      ],
      destinationBucket: dashboardBucket,
      extract: true,
      prune: true,
      destinationKeyPrefix: "/",
    });

    const apiLambda = new lambda.Function(this, "ApiLambdaHandler", {
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.minutes(1),
      allowPublicSubnet: true,
      code: lambda.Code.fromBucket(
        quantumServerFileStorage,
        "quantum-server-infranstucture-dashboard-backend.zip"
      ),
      handler: "dist/index.handler",
      environment: {
        USER_EMAIL: "a",
        USER_PASSWORD: "a",
        JWT_SECRET: "QqvY75gKaJslShOG6SWDGPhuMvl5ay8WcA1BQibv92M=",
        CREDENTIALS_AWS_BUCKET: this.gameBuildBucket.bucketName,
        CREDENTIALS_AWS_REGION:cdk.Stack.of(this).region,
        // REDIS_HOST: props.redisEndpoint,
        // REDIS_PORT: props.redisPort.toString(),
      },
      vpc: props.vpc
    });




    this.gameBuildBucket.grantReadWrite(apiLambda);
    this.gameBuildBucket.grantPutAcl(apiLambda);

    apiLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:PutObject", // Permission to upload files
          "s3:PutObjectAcl", // Permission to set the ACL
        ],
        resources: [
          `${dashboardBucket.bucketArn}/*`,
          `${this.gameBuildBucket.bucketArn}/*`,
        ],
      })
    );

    const apiGateway = new apigateway.RestApi(this, `${props?.stackName}-ApiGateway`, {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS, // Allow all origins
        allowMethods: apigateway.Cors.ALL_METHODS, // Allow all methods
        allowHeaders: [
          ...apigateway.Cors.DEFAULT_HEADERS, // Default headers
          "apollo-require-preflight", // Add your specific header
        ],
      },
    });


    const graphqlResource = apiGateway.root.addResource("graphql");
    const graphqlIntegration = new apigateway.LambdaIntegration(apiLambda);
    graphqlResource.addMethod("POST", graphqlIntegration);
    graphqlResource.addMethod("GET", graphqlIntegration);

    
    apiGateway.root.addMethod("GET", new apigateway.LambdaIntegration(apiLambda));
    apiGateway.root.addMethod("POST", new apigateway.LambdaIntegration(apiLambda));

    // Upload API URL
    const apiUrlLambda = new lambda.Function(this, `${props?.stackName}-ApiUrlLambda`, {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda/deploy-api-url-file"), // Directory where the Lambda function is stored
      environment: {
        BUCKET_NAME: dashboardBucket.bucketName, // Pass the bucket name as an environment variable
        REACT_APP_GRAPH_URL: apiGateway.url, // Replace with the actual GraphQL URL
      },
    });

    dashboardBucket.grantWrite(apiUrlLambda);

    // Create a Custom Resource to invoke the Lambda during deployment
    const invokeApiUrlLambda = new customResources.Provider(
      this,
      "InvokeApiUrlLambdaProvider",
      {
        onEventHandler: apiUrlLambda,
      }
    );

    // Define a custom resource that invokes the Lambda on deployment
    const lambdaInvoke = new cdk.CustomResource(this, "InvokeApiUrlLambda", {
      serviceToken: invokeApiUrlLambda.serviceToken,
    });

    lambdaInvoke.node.addDependency(bucketDeployment)


    const distribution = new cloudfront.Distribution(
      this,
      "ReactAppDistribution",
      {
        defaultBehavior: {
          origin: new origins.S3StaticWebsiteOrigin(dashboardBucket),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        // Redirect 404 errors (non-existent paths) to index.html
        errorResponses: [
          {
            httpStatus: 404,
            responseHttpStatus: 200, // Serve index.html for 404 errors
            responsePagePath: "/index.html", // Ensure it points to the correct path
            ttl: cdk.Duration.minutes(0), // Optional: Ensure dynamic updates
          },
        ],
      }
    );

    distribution.node.addDependency(lambdaInvoke);



    new cdk.CfnOutput(this, "CloudFront", {
      value: distribution.distributionDomainName,
    });
    new cdk.CfnOutput(this, "Bucket", {
      value: dashboardBucket.bucketDomainName,
    });
  }
}
