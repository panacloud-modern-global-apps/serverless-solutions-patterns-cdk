import * as cdk from "@aws-cdk/core";
import * as s3 from "@aws-cdk/aws-s3";
import * as s3n from "@aws-cdk/aws-s3-notifications";
import * as lambda from "@aws-cdk/aws-lambda";
import * as lambdaDestination from "@aws-cdk/aws-lambda-destinations";
import * as iam from "@aws-cdk/aws-iam";
import * as sqs from "@aws-cdk/aws-sqs";
import * as event from "@aws-cdk/aws-events";
import * as stepfunctions from "@aws-cdk/aws-stepfunctions";
import * as stepFunctionTasks from "@aws-cdk/aws-stepfunctions-tasks";

import {
  SqsToLambda,
  SqsToLambdaProps,
} from "@aws-solutions-constructs/aws-sqs-lambda";
import { S3ToSqs, S3ToSqsProps } from "@aws-solutions-constructs/aws-s3-sqs";
import {
  EventsRuleToStepFunction,
  EventsRuleToStepFunctionProps,
} from "@aws-solutions-constructs/aws-events-rule-step-function";

export class ImplementTheEventBridgeEtlArchitectureStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //Creating Event Bus
    const bus = new event.EventBus(this, "eventBus", {
      eventBusName: "ETLEventBus",
    });

    //Creating aws-s3-sqs solutions construct
    const s3_sqs_props: S3ToSqsProps = {
      queueProps: {
        visibilityTimeout: cdk.Duration.seconds(300) as any,
        encryption: sqs.QueueEncryption.UNENCRYPTED,
      },
      bucketProps: {
        versioned: true,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      },
      s3EventTypes: [s3.EventType.OBJECT_CREATED], //By default
    };
    const sqs_s3 = new S3ToSqs(this as any, "S3_To_Sqs", s3_sqs_props);

    //Create a specific role for Lambda function
    const role = new iam.Role(this, "LambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
    });
    //Attaching s3, logs and events access to policy
    const policy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["s3:*", "logs:*", "events:*"],
      resources: ["*"],
    });

    //granting IAM permissions to a role
    role.addToPolicy(policy);

    //Creating aws-sqs-lambda solutions construct
    const sqs_lambda_props: SqsToLambdaProps = {
      existingQueueObj: sqs_s3.sqsQueue,
      lambdaFunctionProps: {
        runtime: lambda.Runtime.NODEJS_10_X as any,
        handler: "index.handler",
        code: lambda.Code.fromAsset(`lambda-fns/extract`) as any,
        reservedConcurrentExecutions: 2,
        role: role as any,
        onSuccess: new lambdaDestination.EventBridgeDestination(bus) as any,
      },
      deadLetterQueueProps: {
        encryption: sqs.QueueEncryption.UNENCRYPTED,
      },
    };
    const sqs_lambda = new SqsToLambda(
      this as any,
      "SqsToLambda",
      sqs_lambda_props
    );

    // this function adds data to the dynamoDB table
    const transformFunc = new lambda.Function(this, "transformData", {
      runtime: lambda.Runtime.NODEJS_10_X, // execution environment
      code: lambda.Code.fromAsset("lambda-fns/transform/"), // code loaded from "lambda" directory
      handler: "index.handler",
    });

    // this function logs the status of the operation
    const loadFunc = new lambda.Function(this, "loadData", {
      runtime: lambda.Runtime.NODEJS_10_X, // execution environment
      code: lambda.Code.fromAsset("lambda-fns/load"), // code loaded from "lambda" directory
      handler: "index.handler",
      onSuccess: new lambdaDestination.EventBridgeDestination(bus) as any,
    });

    const firstStep = new stepFunctionTasks.LambdaInvoke(
      this,
      "Invoke transform lambda",
      {
        lambdaFunction: transformFunc as any,
      }
    );

    const secondStep = new stepFunctionTasks.LambdaInvoke(
      this,
      "Invoke load lambda",
      {
        lambdaFunction: loadFunc as any,
        inputPath: "$.Payload",
      }
    );
    // creating chain to define the sequence of execution

    const chain = stepfunctions.Chain.start(firstStep as any).next(
      secondStep as any
    );

    const aws_events_rule_step_function: EventsRuleToStepFunctionProps = {
      stateMachineProps: {
        definition: chain as any,
      },

      eventRuleProps: {
        ruleName: "extractedDataRule",
        eventBus: bus as any,
        eventPattern: {
          detailType: ["EtlProcess"],
          source: ["myETLapp"],
          detail: {
            status: ["extracted"],
          },
        },
      },
      createCloudWatchAlarms: false,
    };

    new EventsRuleToStepFunction(
      this as any,
      "test-events-rule-step-function-stack",
      aws_events_rule_step_function
    );
  }
}
