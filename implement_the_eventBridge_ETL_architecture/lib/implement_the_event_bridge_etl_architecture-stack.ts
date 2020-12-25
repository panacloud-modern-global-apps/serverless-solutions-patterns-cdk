import * as cdk from "@aws-cdk/core";
import * as s3 from "@aws-cdk/aws-s3";
import * as s3n from "@aws-cdk/aws-s3-notifications";
import * as lambda from "@aws-cdk/aws-lambda";
import * as iam from "@aws-cdk/aws-iam";

import {
  SqsToLambda,
  SqsToLambdaProps,
} from "@aws-solutions-constructs/aws-sqs-lambda";
import { S3ToSqs, S3ToSqsProps } from "@aws-solutions-constructs/aws-s3-sqs";

export class ImplementTheEventBridgeEtlArchitectureStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //Creating aws-s3-sqs solutions construct
    const s3_sqs_props: S3ToSqsProps = {
      queueProps: {
        visibilityTimeout: cdk.Duration.seconds(300),
      },
      bucketProps: {
        versioned: true,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      },
      s3EventTypes: [s3.EventType.OBJECT_CREATED], //By default
    };
    const sqs_s3 = new S3ToSqs(this, "S3_To_Sqs", s3_sqs_props);

    //Create a specific role for Lambda function
    const role = new iam.Role(this, "LambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });

    //Attaching s3 read only access to policy
    const policy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["s3:*", "logs:*"],
      resources: ["*"],
    });

    //granting IAM permissions to a role
    role.addToPolicy(policy);

    //Creating aws-sqs-lambda solutions construct
    const sqs_lambda_props: SqsToLambdaProps = {
      existingQueueObj: sqs_s3.sqsQueue,
      lambdaFunctionProps: {
        runtime: lambda.Runtime.NODEJS_10_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset(`lambda-fns/extract`),
        reservedConcurrentExecutions: 2,
        role: role,

        environment: {
          S3_BUCKET_NAME: sqs_s3.s3Bucket?.bucketName as string,
          S3_OBJECT_KEY: "",
        },
      },
    };
    const sqs_lambda = new SqsToLambda(this, "SqsToLambda", sqs_lambda_props);
  }
}
