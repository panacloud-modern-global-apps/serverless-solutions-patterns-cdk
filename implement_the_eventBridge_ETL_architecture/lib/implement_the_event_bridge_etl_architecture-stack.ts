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
import * as ddb from "@aws-cdk/aws-dynamodb";

import {
  SqsToLambda,
  SqsToLambdaProps,
} from "@aws-solutions-constructs/aws-sqs-lambda";
import { S3ToSqs, S3ToSqsProps } from "@aws-solutions-constructs/aws-s3-sqs";
// import {
//   EventsRuleToStepFunction,
//   EventsRuleToStepFunctionProps,
// } from "@aws-solutions-constructs/aws-events-rule-step-function";
import {
  EventsRuleToLambdaProps,
  EventsRuleToLambda,
} from "@aws-solutions-constructs/aws-events-rule-lambda";

export class ImplementTheEventBridgeEtlArchitectureStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    /**
     * If left unchecked this pattern could "fan out" on the transform and load
     * lambdas to the point that it consumes all resources on the account. This is
     * why we are limiting concurrency to 2 on all 3 lambdas. Feel free to raise this.
     */
    const LAMBDA_THROTTLE_SIZE = 2;

    //Creating Dynamodb Table
    const ddbTable = new ddb.Table(this, "ddbTable", {
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "id",
        type: ddb.AttributeType.STRING,
      },
    });

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
        reservedConcurrentExecutions: LAMBDA_THROTTLE_SIZE,
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

    // defines a lambda to transform the data that was extracted from s3
    const transformFunc = new lambda.Function(this, "transformData", {
      runtime: lambda.Runtime.NODEJS_10_X, // execution environment
      code: lambda.Code.fromAsset("lambda-fns/transform"), // code loaded from "lambda-fns/transform" directory
      handler: "index.handler",
      timeout: cdk.Duration.seconds(3),
      reservedConcurrentExecutions: LAMBDA_THROTTLE_SIZE,
      onSuccess: new lambdaDestination.EventBridgeDestination(bus) as any,
    });

    // this function adds data to the dynamoDB table
    const loadFunc = new lambda.Function(this, "loadData", {
      runtime: lambda.Runtime.NODEJS_10_X, // execution environment
      code: lambda.Code.fromAsset("lambda-fns/load"), // code loaded from "lambda-fns/load" directory
      handler: "index.handler",
      reservedConcurrentExecutions: LAMBDA_THROTTLE_SIZE,
      environment: {
        DDB_TABLE_NAME: ddbTable.tableName,
      },
      timeout: cdk.Duration.seconds(3),
      onSuccess: new lambdaDestination.EventBridgeDestination(bus) as any,
    });

    // this function logs the status of the operation
    const observeFunc = new lambda.Function(this, "observeData", {
      runtime: lambda.Runtime.NODEJS_10_X, // execution environment
      code: lambda.Code.fromAsset("lambda-fns/observe"), // code loaded from "lambda-fns/load" directory
      handler: "index.handler",
      reservedConcurrentExecutions: LAMBDA_THROTTLE_SIZE,
      timeout: cdk.Duration.seconds(3),
    });

    // Giving LoadFunc Lambda permission to access dynamo db
    ddbTable.grantFullAccess(loadFunc);
    // Giving LoadFunc Lambda permission to put events
    event.EventBus.grantPutEvents(transformFunc as any);
    // // Giving transformFunc Lambda permission to put events
    event.EventBus.grantPutEvents(loadFunc as any);

    //Creatig solutions construct aws-events-rule-lambda for  transform lambda
    const event_rule_transform_lambda: EventsRuleToLambdaProps = {
      existingLambdaObj: transformFunc as any,
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
    };

    new EventsRuleToLambda(
      this as any,
      "test-events-rule-transform-lambda",
      event_rule_transform_lambda
    );

    //Creatig solutions construct aws-events-rule-lambda for  load lambda
    const event_rule_load_lambda: EventsRuleToLambdaProps = {
      existingLambdaObj: loadFunc as any,
      eventRuleProps: {
        ruleName: "transformedDataRule",
        eventBus: bus as any,
        eventPattern: {
          detailType: ["EtlProcess"],
          source: ["myETLapp"],
          detail: {
            status: ["transformed"],
          },
        },
      },
    };

    new EventsRuleToLambda(
      this as any,
      "test-events-rule-load-lambda",
      event_rule_load_lambda
    );

    //Creatig solutions construct aws-events-rule-lambda for  load lambda
    const event_rule_observe_lambda: EventsRuleToLambdaProps = {
      existingLambdaObj: observeFunc as any,
      eventRuleProps: {
        ruleName: "allStatusRule",
        eventBus: bus as any,
        eventPattern: {
          detailType: ["EtlProcess"],
          source: ["myETLapp"],
          detail: {
            status: ["extracted", "transformed", "success"],
          },
        },
      },
    };

    new EventsRuleToLambda(
      this as any,
      "test-events-rule-observe-lambda",
      event_rule_observe_lambda
    );
  }
}
// //Invote transformFunc lambda
// const firstStep = new stepFunctionTasks.LambdaInvoke(
//   this,
//   "Invoke transform lambda",
//   {
//     lambdaFunction: transformFunc as any,
//   }
// );
// //Invote loadFunc lambda
// const secondStep = new stepFunctionTasks.LambdaInvoke(
//   this,
//   "Invoke load lambda",
//   {
//     lambdaFunction: loadFunc as any,
//     inputPath: "$.Payload",
//   }
// );

// // creating chain to define the sequence of execution
// const chain = stepfunctions.Chain.start(firstStep as any).next(
//   secondStep as any
// );

// //aws_events_rule_step_function Solutions construct
// const aws_events_rule_step_function: EventsRuleToStepFunctionProps = {
//   stateMachineProps: {
//     definition: chain as any,
//   },

//   eventRuleProps: {
//     ruleName: "extractedDataRule",
//     eventBus: bus as any,
//     eventPattern: {
//       detailType: ["EtlProcess"],
//       source: ["myETLapp"],
//       detail: {
//         status: ["extracted"],
//       },
//     },
//   },
//   createCloudWatchAlarms: false,
// };

// new EventsRuleToStepFunction(
//   this as any,
//   "test-events-rule-step-function-stack",
//   aws_events_rule_step_function
// );
