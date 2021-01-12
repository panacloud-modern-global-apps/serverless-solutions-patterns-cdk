import * as cdk from "@aws-cdk/core";
import { ApiGatewayToLambda } from "@aws-solutions-constructs/aws-apigateway-lambda";
import {
  Effect,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "@aws-cdk/aws-iam";
import * as lambda from "@aws-cdk/aws-lambda";
import * as sqs from "@aws-cdk/aws-sqs";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import { SqsEventSource } from "@aws-cdk/aws-lambda-event-sources";

export class ImplementTheScalableWebhookArchitectureStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Dynamo Setup
    // This is standing in for what is RDS on the diagram due to simpler/cheaper setup
    const table = new dynamodb.Table(this, "the-scalable-webhook-stack", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING }, //the key being id means we squash duplicate sqs messages
    });

    // Queue Setup
    // SQS creation
    const queue = new sqs.Queue(this, "RDSPublishQueue", {
      visibilityTimeout: cdk.Duration.seconds(300),
    });

    ///create a specific role for Lambda function
    const role = new Role(this, "LambdaRole", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
    });

    ///Attaching DynamoDb access to policy
    const policy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["sqs:*", "logs:*"],
      resources: ["*"],
    });

    //granting IAM permissions to role
    role.addToPolicy(policy);

    //  API Gateway Proxy
    // Used to expose the webhook through a URL
    // defines an AWS Lambda resource to publish to our queue
    // defines an API Gateway REST API resource backed by our function.
    const apiToLambda = new ApiGatewayToLambda(
      this,
      "SQSPublishLambdaHandlerApi",
      {
        lambdaFunctionProps: {
          runtime: lambda.Runtime.NODEJS_10_X,
          code: lambda.Code.fromAsset("lambda/publish"),
          role: role,
          handler: "lambda.handler", // file is "lambda", function is "handler"
          environment: {
            queueURL: queue.queueUrl,
          },
        },
      }
    );

    // defines an AWS Lambda resource to pull from our queue
    const sqsSubscribeLambda = new lambda.Function(
      this,
      "SQSSubscribeLambdaHandler",
      {
        runtime: lambda.Runtime.NODEJS_12_X, // execution environment
        code: lambda.Code.fromAsset("lambda/subscribe"), // code loaded from the "lambdas/subscribe" directory
        handler: "lambda.handler", // file is "lambda", function is "handler"
        reservedConcurrentExecutions: 2, // throttle lambda to 2 concurrent invocations
        environment: {
          queueURL: queue.queueUrl,
          tableName: table.tableName,
        },
      }
    );
    queue.grantConsumeMessages(sqsSubscribeLambda);
    sqsSubscribeLambda.addEventSource(new SqsEventSource(queue, {}));
    table.grantReadWriteData(sqsSubscribeLambda);
  }
}
