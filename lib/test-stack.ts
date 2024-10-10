import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { BucketAccessControl } from "aws-cdk-lib/aws-s3";
import * as customResources from "aws-cdk-lib/custom-resources";
import * as iam from "aws-cdk-lib/aws-iam";

export class ReactAppStack1 extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const existingBucket = s3.Bucket.fromBucketName(
      this,
      "ExistingBucket",
      "quantum-server-file-storage"
    );

    const siteBucket = new s3.Bucket(this, "SiteBucket", {
      bucketName: "nikusha-test1", // Replace with your bucket name
      publicReadAccess: true,
      websiteIndexDocument: "index.html",
      websiteErrorDocument: "index.html", // For handling React Router
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      accessControl: BucketAccessControl.PRIVATE,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS,
    });

    const bucket = new s3.Bucket(this, 'MyS3BucketStackNew', {
      bucketName: "my-new-bucket-nikusha-test",
      versioned: true,  // Enable versioning
      removalPolicy: cdk.RemovalPolicy.DESTROY,  // Destroy the bucket when the stack is deleted
      autoDeleteObjects: true,  // Automatically delete objects when the bucket is destroyed
      publicReadAccess: true,
      accessControl: BucketAccessControl.PRIVATE,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS,
    });
    

    new s3deploy.BucketDeployment(this, "DeployReactApp", {
      sources: [
        s3deploy.Source.bucket(
          existingBucket,
          "quantum-server-infranstucture-dashboard-frontend.zip"
        ),
      ],
      destinationBucket: siteBucket,
      extract: true,
      prune: true,
      destinationKeyPrefix: "/",
    });

    const distribution = new cloudfront.CloudFrontWebDistribution(
      this,
      "ReactAppDistribution",
      {
        originConfigs: [
          {
            s3OriginSource: {
              s3BucketSource: siteBucket,
            },
            behaviors: [{ isDefaultBehavior: true }],
          },
        ],
      }
    );

    const apiLambda = new lambda.Function(this, "ApiLambdaHandler", {
      runtime: lambda.Runtime.NODEJS_18_X,
      code: lambda.Code.fromBucket(
        existingBucket,
        "quantum-server-infranstucture-dashboard-backend.zip"
      ),
      handler: "dist/index.handler",
      environment: {
        USER_EMAIL: "a",
        USER_PASSWORD: "a",
        JWT_SECRET: "QqvY75gKaJslShOG6SWDGPhuMvl5ay8WcA1BQibv92M=",
        CREDENTIALS_AWS_BUCKET: bucket.bucketName,
        CREDENTIALS_AWS_REGION: "us-east-1",
      },
    });

    const FilesBucket = s3.Bucket.fromBucketName(
      this,
      "FilesBucket",
      bucket.bucketName
    );

    FilesBucket.grantReadWrite(apiLambda);
    FilesBucket.grantPutAcl(apiLambda);

    apiLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:PutObject", // Permission to upload files
          "s3:PutObjectAcl", // Permission to set the ACL
        ],
        resources: [
          `${siteBucket.bucketArn}/*`,
          `${FilesBucket.bucketArn}/*`,
        ],
      })
    );

    siteBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        actions: ["s3:PutObjectAcl"],
        resources: [`${siteBucket.bucketArn}/*`],
        principals: [new iam.ArnPrincipal(apiLambda.role?.roleArn || "")], // Ensure Lambda's role has the necessary permissions
      })
    );

    const fileBucket = s3.Bucket.fromBucketName(
      this,
      "FileBucket",
      bucket.bucketName
    );

    fileBucket.grantWrite(apiLambda);

    const api = new apigateway.RestApi(this, "MyApi", {
      restApiName: "test",
      description: "TTest",
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS, // Allow all origins
        allowMethods: apigateway.Cors.ALL_METHODS, // Allow all methods
        allowHeaders: [
          ...apigateway.Cors.DEFAULT_HEADERS, // Default headers
          "apollo-require-preflight", // Add your specific header
        ],
      },
    });

    const apiUrl = `${api.url}`;


    // const graphqlResource = api.root.addResource("graphql");
    // const graphqlIntegration = new apigateway.LambdaIntegration(apiLambda);
    // graphqlResource.addMethod("POST", graphqlIntegration);
    // api.root.addMethod("GET", new apigateway.LambdaIntegration(apiLambda));

    const graphqlResource = api.root.addResource("graphql");
    const graphqlIntegration = new apigateway.LambdaIntegration(apiLambda);
    graphqlResource.addMethod("POST", graphqlIntegration);
    graphqlResource.addMethod("GET", graphqlIntegration);
    api.root.addMethod("GET", new apigateway.LambdaIntegration(apiLambda));
    api.root.addMethod("POST", new apigateway.LambdaIntegration(apiLambda));

    // Upload API URL
    const apiUrlLambda = new lambda.Function(this, "ApiUrlLambda", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset("lambda/deploy-api-url-file"), // Directory where the Lambda function is stored
      timeout: cdk.Duration.minutes(1),
      environment: {
        BUCKET_NAME: siteBucket.bucketName, // Pass the bucket name as an environment variable
        REACT_APP_GRAPH_URL: apiUrl, // Replace with the actual GraphQL URL
        DUMMY_VAR: 'force-redeploy'
      },
    });

    siteBucket.grantWrite(apiUrlLambda);

    // Create a Custom Resource to invoke the Lambda during deployment
    const invokeApiUrlLambda = new customResources.Provider(
      this,
      "InvokeApiUrlLambdaProvider",
      {
        onEventHandler: apiUrlLambda,
      }
    );

    // Define a custom resource that invokes the Lambda on deployment
    new cdk.CustomResource(this, "InvokeApiUrlLambda", {
      serviceToken: invokeApiUrlLambda.serviceToken,
    });
  }
}