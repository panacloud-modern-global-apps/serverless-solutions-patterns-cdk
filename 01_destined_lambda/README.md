## What is AWS Solutions Constructs?

AWS Solutions Constructs (Constructs) is an open-source extension of the AWS Cloud Development Kit (AWS CDK) that provides multi-service, well-architected patterns for quickly defining solutions in code to create predictable and repeatable infrastructure. The goal is to accelerate the experience for developers to build solutions of any size using pattern-based definitions for their architecture.

## Why use AWS Solutions Constructs?

With the rate of innovation of cloud providers, knowing and understanding best practices and ensuring they are implemented correctly across your solution can be daunting. Constructs allows you to combine pre-built, well-architected patterns and use cases that perform common actions using cloud services in a scalable and secure manner. Because Constructs provides a library for modern programming languages, you can apply existing development skills and familiar tools to the task of building well-architected cloud infrastructure for your solutions.

## The Destined Lambda Architecture

This project combines Lambda Destinations with Amazon EventBridge using [AWS Solution Constructs](https://docs.aws.amazon.com/solutions/latest/constructs/welcome.html) to show you that with EventBridge rules you can decouple your components in an event driven architecture and by combining it with lambda destinations you can strip out EventBridge specific code from your lambda functions themselves and decouple further.

## Architecture

![arhitecture Image](https://github.com/cdk-patterns/serverless/raw/master/the-destined-lambda/img/arch.png)

#### Step 1 (Create An SNS Topic and Topic Subscribtion)

```typescript
import { SnsToLambda } from "@aws-solutions-constructs/aws-sns-lambda";

const sns_subs_lambda = new SnsToLambda(this, "snsLambda", {
  lambdaFunctionProps: {
    runtime: lambda.Runtime.NODEJS_12_X,
    handler: "main.handler",
    code: lambda.Code.fromAsset(`lambda`),
    onSuccess: new destinations.EventBridgeDestination(eventbus),
    onFailure: new destinations.EventBridgeDestination(eventbus),
  },
  topicProps: {
    displayName: "destinatedLambdaTopic",
  },
});
```

This AWS Solutions Construct implements an Amazon SNS connected to an AWS Lambda function. This lambda is a destinated lambda Use an Event Bridge event bus as a Lambda destination.

#### Step 2 (Connect API-gateway With SNS)

- Since we don't have any AWS Solution Construct to Connect API-gateway with SNS directly so we do that manually by using (L2 Constructs ).

```typescript
const gateway = new apigw.RestApi(this, "theDestinedLambdaAPI", {
  deployOptions: {
    metricsEnabled: true,
    loggingLevel: apigw.MethodLoggingLevel.INFO,
    dataTraceEnabled: true,
    stageName: "prod",
  },
});
gateway.root.addResource("SendEvent").addMethod(
  "GET",
  new apigw.Integration({
    type: apigw.IntegrationType.AWS, //native aws integration
    integrationHttpMethod: "POST",
    uri: "arn:aws:apigateway:us-east-2:sns:path//", // This is how we setup an SNS Topic publish operation.
    options: {
      credentialsRole: apigwSnsRole,
      requestParameters: {
        "integration.request.header.Content-Type":
          "'application/x-www-form-urlencoded'", // Tell api gw to send our payload as query params
      },
      requestTemplates: {
        // This is the VTL to transform our incoming request to post to our SNS topic
        // Check: https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html
        "application/json":
          "Action=Publish&" +
          "TargetArn=$util.urlEncode('" +
          sns_subs_lambda.snsTopic.topicArn +
          "')&" +
          "Message=please $input.params().querystring.get('mode')&" +
          "Version=2010-03-31",
      },
      passthroughBehavior: apigw.PassthroughBehavior.NEVER,
      integrationResponses: [
        {
          // Tells APIGW which response to use based on the returned code from the service
          statusCode: "200",
          responseTemplates: {
            // Just respond with a generic message
            // Check https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html
            "application/json": JSON.stringify({
              message: "Message added to SNS topic",
            }),
          },
        },
        {
          // For errors, we check if the response contains the words BadRequest
          selectionPattern: "^[Error].*",
          statusCode: "400",
          responseTemplates: {
            "application/json": JSON.stringify({
              state: "error",
              message: "$util.escapeJavaScript($input.path('$.errorMessage'))",
            }),
          },
          responseParameters: {
            "method.response.header.Content-Type": "'application/json'",
            "method.response.header.Access-Control-Allow-Origin": "'*'",
            "method.response.header.Access-Control-Allow-Credentials": "'true'",
          },
        },
      ],
    },
  }),
  {
    methodResponses: [
      //We need to define what models are allowed on our method response
      {
        // Successful response from the integration
        statusCode: "200",
        // Define what parameters are allowed or not
        responseParameters: {
          "method.response.header.Content-Type": true,
          "method.response.header.Access-Control-Allow-Origin": true,
          "method.response.header.Access-Control-Allow-Credentials": true,
        },
        // Validate the schema on the response
        responseModels: {
          "application/json": responseModel,
        },
      },
      {
        // Same thing for the error responses
        statusCode: "400",
        responseParameters: {
          "method.response.header.Content-Type": true,
          "method.response.header.Access-Control-Allow-Origin": true,
          "method.response.header.Access-Control-Allow-Credentials": true,
        },
        responseModels: {
          "application/json": errorResponseModel,
        },
      },
    ],
  }
);
```

- Whenever, (GET) request is made it publish a message on SNS topic.

#### Step 3 (Destinated Lambda Code)

```typescript
exports.handler = async (event: any, context: any, callback: any) => {
  console.log("Event Received");
  console.log(JSON.stringify(event));

  let records: any[] = event.Records;

  //SNS can send multiple records
  for (let index in records) {
    let message = records[index]?.Sns.Message;
    if (message == "please fail") {
      console.log("received failure flag, throwing error");
      throw new Error("test");
    }
  }
  return {
    source: "sns",
    action: "success",
  };
};
```

- This destinated Lambda will check the events records. If it contains the message "please fail" then it will throw the error and destinated Lambda go on a failure destination. Otherwise, It will go to an (OnSuccess) destination.

#### Step 4 (AWS Events Rule And Event Lambda)

```typescript
import { EventsRuleToLambda } from "@aws-solutions-constructs/aws-events-rule-lambda";

new EventsRuleToLambda(this, "successSnsLambdaRule", {
  lambdaFunctionProps: {
    runtime: lambda.Runtime.NODEJS_12_X,
    handler: "success.handler",
    code: lambda.Code.fromAsset(`lambda`),
  },
  eventRuleProps: {
    eventBus: eventbus,
    ruleName: "destinatedLambdaSuccessRule",
    eventPattern: {
      detail: {
        responsePayload: {
          source: ["sns"],
          action: ["success"],
        },
      },
    },
  },
});
```

- This AWS Solutions Construct implements an AWS Events rule and an AWS Lambda function.In eventRuleProps we defines an EventBridge rule which monitors an event based on an event pattern and invoke event targets when the pattern is matched against a triggered event.The target of this event rule is the lambda function which we define in a lambdaFunctionProps.
