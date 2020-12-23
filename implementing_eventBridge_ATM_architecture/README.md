## Introduction

Here, I show how you can build an event producer and consumer in AWS Lambda, and create a rule to route events. The code uses the AWS CDK, so you can deploy the application in your own AWS Account.

In this example, a banking application for automated teller machine (ATM) produces events about transactions. It sends the events to EventBridge, which then uses rules defined by the application to route accordingly. There are three downstream services consuming a subset of these events.
![eventBridge_ATM_architecture](images/eventBridge_ATM_architecture.png)

## Step 1

Initialize your new CDK project.

```bash
cdk init --language=typescript
```

And install the following dependencies.

```bash
npm install @aws-cdk/aws-lambda @aws-cdk/aws-events @aws-cdk/aws-lambda-destinations @aws-solutions-constructs/aws-events-rule-lambda
```

## Step 2

Now add Constructs In you stack

1. First create custom event bus and name it Anything in my case I named it `AtmEventBus`

```typescript
//Creating eventBus
const bus = new event.EventBus(this, "eventBus", {
  eventBusName: "AtmEventBus",
});
```

2. Then add lambda function with basic configuration and provide lambda destination onSucess event which is the event bus in our case.

```typescript
//lambda Function
const producerFunc = new lambda.Function(this, "AtmEventProducer", {
  runtime: lambda.Runtime.NODEJS_12_X,
  code: lambda.Code.fromAsset("atmProducer"),
  handler: "atmFn.handler",
  memorySize: 1024,
  onSuccess: new lambdaDestination.EventBridgeDestination(bus),
});
```

3. Grant the lambda permission to put custom events on `eventbridge`

```typescript
event.EventBus.grantPutEvents(producerFunc);
```

4. Until now we created `L2 Constructs` for the event bus and event producer lambda function. now we are going to use [aws-events-rule-lambda](https://docs.aws.amazon.com/solutions/latest/constructs/aws-events-rule-lambda.html) Solutions Construct to implement an AWS Events rule and an event consumer Lambda function.

```typescript
const Case1Lambda: EventsRuleToLambdaProps = {
  lambdaFunctionProps: {
    runtime: lambda.Runtime.NODEJS_12_X,
    code: lambda.Code.fromAsset("atmConsumer"),
    handler: "case1.handler",
  },
  eventRuleProps: {
    ruleName: "Case1Rule",
    eventBus: bus,
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
    runtime: lambda.Runtime.NODEJS_12_X,
    code: lambda.Code.fromAsset("atmConsumer"),
    handler: "case2.handler",
  },
  eventRuleProps: {
    ruleName: "Case2Rule",
    eventBus: bus,
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
    runtime: lambda.Runtime.NODEJS_12_X,
    code: lambda.Code.fromAsset("atmConsumer"),
    handler: "case3.handler",
  },
  eventRuleProps: {
    ruleName: "Case3Rule",
    eventBus: bus,
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
```

In the above code, we created three solutions constructs for Event rules and downstream lambda functions let's dive deeper to understand about each of them.

All three solutions constructs are almost similar with different use cases

- In `Case1Lambda` Lambda consume only those events whose `result` value set to `approved`.
- In `Case1Lambda` Lambda consume only those events whose `location` value starts with `NY-`.
- In `Case3Lambda` Lambda consume only those events whose `result` value set to `denied`.

#### Learn more about [eventPattern](https://docs.aws.amazon.com/eventbridge/latest/userguide/filtering-examples-structure.html)

## Step 3

Make a file events.ts, listing several test transactions in an Entries array. A single event is defined as follows:

```typescript
// atmProducer/event.ts
module.exports.params = {
  Entries: [
    {
      // Event envelope fields
      Source: "myATMapp",
      EventBusName: "AtmEventBus",
      DetailType: "transaction",
      Time: new Date(),

      // Main event body
      Detail: JSON.stringify({
        action: "withdrawal",
        location: "MA-BOS-01",
        amount: 300,
        result: "approved",
        transactionId: "123456",
        cardPresent: true,
        partnerBank: "Example Bank",
        remainingFunds: 722.34,
      }),
    },
    {
      // Event envelope fields
      Source: "myATMapp",
      EventBusName: "AtmEventBus",
      DetailType: "transaction",
      Time: new Date(),

      // Main event body
      Detail: JSON.stringify({
        action: "withdrawal",
        location: "NY-NYC-001",
        amount: 20,
        result: "approved",
        transactionId: "123457",
        cardPresent: true,
        partnerBank: "Example Bank",
        remainingFunds: 212.52,
      }),
    },
    {
      // Event envelope fields
      Source: "myATMapp",
      EventBusName: "AtmEventBus",
      DetailType: "transaction",
      Time: new Date(),

      // Main event body
      Detail: JSON.stringify({
        action: "withdrawal",
        location: "NY-NYC-002",
        amount: 60,
        result: "denied",
        transactionId: "123458",
        cardPresent: true,
        remainingFunds: 5.77,
      }),
    },
  ],
};
```

## Step 4

Now create a event producer lambda function handler file

```typescript
atmProducer / atmFn.ts;
const AWS = require("aws-sdk");
import { APIGatewayProxyEvent } from "aws-lambda";
const eventbridge = new AWS.EventBridge();

exports.handler = async (event: APIGatewayProxyEvent) => {
  // Do some work...
  // And now create the event...

  const { params } = require("./events.js");

  console.log("--- Params ---");
  console.log(params);
  const result = await eventbridge.putEvents(params).promise();

  console.log("--- Response ---");
  console.log(result);
};
```

## Step 5

Create an event consumer lambda functions handler files, you can put all handlers in a single file but I created different files for each case

- `Case 1` handler code

```typescript
//atmConsumer/case1.ts

import { APIGatewayProxyEvent } from "aws-lambda";

exports.handler = async (event: APIGatewayProxyEvent) => {
  console.log("--- Approved transactions ---");
  console.log(JSON.stringify(event, null, 2));
};
```

- `Case 2` handler code

```typescript
//atmConsumer/case2.ts

import { APIGatewayProxyEvent } from "aws-lambda";

exports.handler = async (event: APIGatewayProxyEvent) => {
  console.log("--- NY location transactions ---");
  console.log(JSON.stringify(event, null, 2));
};
```

- `Case 3` handler code

```typescript
//atmConsumer/case3.ts

import { APIGatewayProxyEvent } from "aws-lambda";

exports.handler = async (event: APIGatewayProxyEvent) => {
  console.log("--- Unapproved transactions ---");
  console.log(JSON.stringify(event, null, 2));
};
```

## Step 5

Now the CDK project is ready to deploy

```bash
npm run build && cdk deploy
```

## Step 6

Open AWS Lambda console, test your event producer lambda function it will generate an event that will store in the custom event bus which you created previously. now head to AWS cloudwatch console to see the logs of event consumer lambda functions.
