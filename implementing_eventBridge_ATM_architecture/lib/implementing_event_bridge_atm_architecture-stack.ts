import * as cdk from "@aws-cdk/core";
import * as lambda from "@aws-cdk/aws-lambda";
import * as event from "@aws-cdk/aws-events";
import * as lambdaDestination from "@aws-cdk/aws-lambda-destinations";
import * as iam from "@aws-cdk/aws-iam";
import * as target from "@aws-cdk/aws-events-targets";
import {
  EventsRuleToLambdaProps,
  EventsRuleToLambda,
} from "@aws-solutions-constructs/aws-events-rule-lambda";
import { IEventBus } from "@aws-cdk/aws-events";

export class ImplementingEventBridgeAtmArchitectureStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    //creating eventBus
    const bus = new event.EventBus(this, "eventBus", {
      eventBusName: "AtmEventBus",
    }) as IEventBus;

    //lambda Function
    const producerFunc = new lambda.Function(this, "AtmEventProducer", {
      runtime: lambda.Runtime.NODEJS_12_X,
      code: lambda.Code.fromAsset("atmProducer"),
      handler: "atmFn.handler",
      memorySize: 1024,
      onSuccess: new lambdaDestination.EventBridgeDestination(bus),
    });
    // Grant the lambda permission to put custom events on eventbridge
    event.EventBus.grantPutEvents(producerFunc);

    const Case1Lambda: EventsRuleToLambdaProps = {
      lambdaFunctionProps: {
        runtime: lambda.Runtime.NODEJS_12_X as any,
        code: lambda.Code.fromAsset("atmConsumer") as any,
        handler: "case1.handler",
      },
      eventRuleProps: {
        ruleName: "Case1Rule",
        eventBus: bus as any,
        eventPattern: {
          detailType: ["transaction"],
          source: ["myATMapp"],
          detail: {
            result: ["approved"],
          },
        },
      },
    };
    const Case2Lambda: EventsRuleToLambdaProps = {
      lambdaFunctionProps: {
        runtime: lambda.Runtime.NODEJS_12_X as any,
        code: lambda.Code.fromAsset("atmConsumer") as any,
        handler: "case2.handler",
      },
      eventRuleProps: {
        ruleName: "Case2Rule",
        eventBus: bus as any,
        eventPattern: {
          detailType: ["transaction"],
          source: ["myATMapp"],
          detail: {
            location: [
              {
                prefix: "NY-",
              },
            ],
          },
        },
      },
    };
    const Case3Lambda: EventsRuleToLambdaProps = {
      lambdaFunctionProps: {
        runtime: lambda.Runtime.NODEJS_12_X as any,
        code: lambda.Code.fromAsset("atmConsumer") as any,
        handler: "case3.handler",
      },
      eventRuleProps: {
        ruleName: "Case3Rule",
        eventBus: bus as any,
        eventPattern: {
          detailType: ["transaction"],
          source: ["myATMapp"],
          detail: {
            result: ["denied"],
          },
        },
      },
    };

    new EventsRuleToLambda(this, "test-events-rule1-lambda", Case1Lambda);
    new EventsRuleToLambda(this, "test-events-rule2-lambda", Case2Lambda);
    new EventsRuleToLambda(this, "test-events-rule3-lambda", Case3Lambda);
  }
}
