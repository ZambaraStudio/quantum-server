import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import { Construct } from "constructs";
import { BucketAccessControl } from "aws-cdk-lib/aws-s3";
import * as customResources from "aws-cdk-lib/custom-resources";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import { v4 as uuidv4 } from "uuid";
import * as logs from "aws-cdk-lib/aws-logs";
import { RemovalPolicy } from "aws-cdk-lib/core";
import { HttpMethods } from "aws-cdk-lib/aws-s3"; // Import HttpMethods enum

import {
  aws_ec2 as ec2,
  aws_lambda as lambda,
  aws_iam as iam,
  aws_s3_deployment as s3deploy,
} from "aws-cdk-lib";
import { QuantumServerCustomUtils } from "../config/cli-config";

export interface QuantumServerCustomUtilsConstructProps {
  quantumServerCustomUtils: QuantumServerCustomUtils;
  stackName: string;
}

export class QuantumServerCustomUtilsConstruct extends Construct {
  public utilLambdas: { [key: string]: lambda.Function } = {};

  constructor(
    scope: Construct,
    id: string,
    props: QuantumServerCustomUtilsConstructProps
  ) {
    super(scope, id);

    Object.keys(props.quantumServerCustomUtils).forEach(key => {
      const lambdaConfig = props.quantumServerCustomUtils[key];

      const customLambda = new lambda.Function(
        this,
        `${props?.stackName}-UtilLambda-${lambdaConfig.lambdaName}`,
        {
          functionName: `${props?.stackName}-UtilLambda-${lambdaConfig.lambdaName}`,
          runtime: lambdaConfig.runtime || lambda.Runtime.NODEJS_20_X,
          handler: "index.handler",
          code: lambda.Code.fromAsset(lambdaConfig.codePath), // Directory where the Lambda function is stored
          timeout: cdk.Duration.seconds(lambdaConfig.timeout || 3),
          environment: {
            ...lambdaConfig.env,
          },
        }
      );

      this.utilLambdas[lambdaConfig.lambdaName] = customLambda;
    });
  }
}
