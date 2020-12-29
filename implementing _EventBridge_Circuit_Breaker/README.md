# The EventBridge Circuit Breaker

In this example, we have a lambda behind an API gateway that is supposed to integrate with an external webservice (www.google.com). The problem is that Google is down and it takes 10 seconds for your lambda to return that error. You pay for every ms of execution with Lambda so this is bad if lots of consumers hit your service.

Don't worry, we have integrated a circuit breaker into this system. When a call to google fails an error event is pushed to EventBridge where it is routed to a lambda that inserts a record into DynamoDB with a 60 second lifespan.

When a consumer calls our lambda we check if there have been 3 failure events in the last 60 seconds and if so we fail immediately, this saves over 9 seconds of execution costs. As the error events expire after 60 seconds our failure events should gradually drop below 3 where we call the service again and check status.

### Closed Circuit Architecture:

The lambda queries the dynamoDB for errors added in the last 60 seconds for this service. If the number found is greater than our threshold we open the circuit. If the number is less we close the circuit and try calling the service. If an error occurs during that call an event is sent to EventBridge where it is routed to a lambda that inserts an error into DynamoDB with a 60 second TTL.

![arhitecture Image](https://github.com/cdk-patterns/serverless/raw/master/the-eventbridge-circuit-breaker/typescript/img/arch2.PNG)

### Open Circuit Architecture:

The lambda queries the dynamoDB for errors added in the last 60 seconds for this service. In this scenario the number found is greater than our threshold so the lambda immediately responds with a failure rather than calling the real service.

![arhitecture Image](https://github.com/cdk-patterns/serverless/raw/master/the-eventbridge-circuit-breaker/typescript/img/arch_closed.png)

#### Step 1 (Integrate API Gateway With Lambda Function)

```typescript
import { ApiGatewayToLambda } from "@aws-solutions-constructs/aws-apigateway-lambda";

const api_to_lambda = new ApiGatewayToLambda(
  this,
  "ApiGatewayToLambdaPattern",
  {
    lambdaFunctionProps: {
      runtime: lambda.Runtime.NODEJS_12_X,
      handler: "lambda.handler",
      code: lambda.Code.fromAsset(`lambda/webService`),
      timeout: Duration.seconds(20),
    },
    apiGatewayProps: {
      defaultMethodOptions: {
        authorizationType: api.AuthorizationType.NONE,
      },
    },
  }
);
```

This AWS Solutions Construct implements an Amazon API Gateway REST API connected to an AWS Lambda function.

- `timeout` The function execution time (in seconds) after which Lambda terminates the function.The default termination time is 300ms

### Step 2 (Integrate Lambda Function With Dynamodb)

```typescript
import { LambdaToDynamoDB } from "@aws-solutions-constructs/aws-lambda-dynamodb";

const lambda_to_dynamodb = new LambdaToDynamoDB(this, "lambdaTodynamodb", {
  existingLambdaObj: api_to_lambda.lambdaFunction,
  dynamoTableProps: {
    tableName: "circuitBreaker",
    partitionKey: {
      name: "RequestID",
      type: dynamodb.AttributeType.STRING,
    },
    sortKey: {
      name: "ExpirationTime",
      type: dynamodb.AttributeType.NUMBER,
    },
    timeToLiveAttribute: "ExpirationTime",
  },
});
// Add index to let us query on siteUrl
const secondaryIndex: GlobalSecondaryIndexProps = {
  indexName: "UrlIndex",
  partitionKey: { name: "SiteUrl", type: dynamodb.AttributeType.STRING },
  sortKey: { name: "ExpirationTime", type: dynamodb.AttributeType.NUMBER },
};

lambda_to_dynamodb.dynamoTable.addGlobalSecondaryIndex(secondaryIndex);
lambda_to_dynamodb.dynamoTable.grantFullAccess(event_lambda.lambdaFunction);
```

This AWS Solutions Construct implements the AWS Lambda function and Amazon DynamoDB table with least-privilege permissions.
The lambda Function which we connect with our DataBase (`Dynamodb`) is the same lambda which is integerated with APIgateway.

- `timeToLiveAttribute` : Amazon DynamoDB Time to Live (TTL) allows you to define a per-item timestamp to determine when an item is no longer needed. Shortly after the date and time of the specified timestamp, DynamoDB deletes the item from your table without consuming any write throughput.TTL attributes must use the epoch time format. For example, the epoch timestamp for May 5, 2020 16:52:32 UTC is 1588697552. You can use a free online converter, such as `EpochConverter`, to get the correct value.

### Step 3 (Integrate Event Rule With Lambda)

```typescript
import { EventsRuleToLambda } from "@aws-solutions-constructs/aws-events-rule-lambda";

const event_lambda = new EventsRuleToLambda(this, "ErrorLambdaOfService", {
  lambdaFunctionProps: {
    runtime: lambda.Runtime.NODEJS_12_X,
    handler: "lambda.handler",
    code: lambda.Code.fromAsset(`lambda/error`),
  },
  eventRuleProps: {
    eventPattern: {
      source: ["eventBridge.circuitBreaker"],
      detailType: ["httpcall"],
      detail: {
        status: ["fail"],
      },
    },
  },
});
```

This AWS Solutions Construct implements an AWS Events rule and an AWS Lambda function.In eventRuleProps we defines an EventBridge rule which monitors an event based on an event pattern and invoke event targets when the pattern is matched against a triggered event.Whenever,Event is publish and matches with this rule . Rule routes them to `target` which in our case is`Lambda Function` for processing.

### Step 4 (Create Lambda Functions)

- Create a Directory name `lambda` at Root.
- In Lambda Directory Create two Directories name `webService` and `error`.
- Now , Create a File name `lambda.ts` in `webService` directory.

- In this lambda we check if there have been 3 failure events in the last 60 seconds and if so we fail immediately, this saves over 9 seconds of execution costs.

```typescript
const AWS = require("aws-sdk");
AWS.config.region = process.env.AWS_REGION || "us-east-2";
const eventbridge = new AWS.EventBridge();
export {};

const ERROR_THRESHOLD = 3;
const serviceURL = "www.google.com";
let response: any;

exports.handler = async (event: any, context: any) => {
  // create AWS SDK clients
  const dynamo = new AWS.DynamoDB();
  const secondsSinceEpoch = Math.round(Date.now() / 1000);

  // We are querying our error Dynamo to count how many errors are in there for www.google.com
  var dynamoParams = {
    ExpressionAttributeValues: {
      ":v1": { S: serviceURL },
      ":now": { N: secondsSinceEpoch.toString() },
    },
    KeyConditionExpression: "SiteUrl = :v1 and ExpirationTime > :now",
    IndexName: "UrlIndex",
    TableName: "circuitBreaker",
  };

  const recentErrors = await dynamo.query(dynamoParams).promise();

  console.log("--- Recent Errors ---");
  console.log(recentErrors.Count);
  console.log(JSON.stringify(recentErrors));

  // If we are within our error threshold, make the http call
  if (recentErrors.Count < ERROR_THRESHOLD) {
    let errorType = "";

    // In here assume we made an http request to google and it was down,
    // 10 sec hard coded delay for simulation
    const fakeServiceCall = await new Promise((resolve, reject) => {
      console.log("--- Calling Webservice, recent errors below threshold ---");
      setTimeout(function () {
        reject("service timeout exception");
      }, 10000);
    }).catch((reason) => {
      console.log("--- Service Call Failure ---");
      console.log(reason);
      errorType = reason;
    });
    // Building our failure event for EventBridge
    var params = {
      Entries: [
        {
          EventBusName: "default",
          Source: "eventBridge.circuitBreaker",
          DetailType: "httpcall",
          Detail: JSON.stringify({
            status: "fail",
            siteUrl: serviceURL,
            errorType: errorType,
          }),
        },
      ],
    };
    const result = await eventbridge.putEvents(params).promise();

    console.log("--- EventBridge Response ---");
    console.log(result);
    response = sendRes(
      500,
      "Something appears to be wrong with this service, please try again later"
    );
  } else {
    console.log("Circuit currently closed, sending back failure response");
    response = sendRes(
      500,
      "This service has been experiencing issues for a while, we have closed the circuit"
    );
  }

  return response;
};

const sendRes = (status: any, body: any) => {
  let response = {
    statusCode: status,
    headers: {
      "Content-Type": "text/html",
    },
    body: body,
  };
  return response;
};
```

The lambda queries the dynamoDB for errors added in the last 60 seconds for this service. If the number found is greater than our threshold we open the circuit. If the number is less we close the circuit and try calling the service. If an error occurs during that call an event is sent to EventBridge where it is routed to a lambda that inserts an error into DynamoDB with a 60 second TTL.

- Now , Create a File name `lambda.ts` in `error` directory.

```typescript
const AWS = require("aws-sdk");
const ddb = new AWS.DynamoDB();
export {};

exports.handler = async function (event: any) {
  console.log(
    "hello from failure lambda request :",
    JSON.stringify(event, null, 2)
  );
  const secondsSinceEpoch = Math.round(Date.now() / 1000);
  const expirationTime = "" + (secondsSinceEpoch + 60);

  var params = {
    TableName: "circuitBreaker",
    Item: {
      RequestID: {
        S: Math.random().toString(36).substring(2) + Date.now().toString(36),
      },
      SiteUrl: { S: event.detail.siteUrl },
      ErrorType: { S: event.detail.errorType },
      ExpirationTime: { N: expirationTime },
    },
  };
  // Call DynamoDB to add the item to the table
  let result = await ddb.putItem(params).promise();
  console.log(result);
};
```
- This lambda function simply put data in Dynamodb . 

### When You Would Use This Pattern

When integrating with an external webservice via a lambda that is not stable. This will save you execution costs, it will also improve end user experience because not only are they still receiving an error without this but they have to wait the full 10 seconds for it.

### How to test pattern

After deployment you will have an api gateway where hitting any endpoint calls our fake unstable google endpoint. The first 3 times you hit the endpoint should all take 10 seconds each, then the next should be instant with a message saying the circuit was closed.

Now wait 60 seconds and try again, you should see the 10 second wait return

### Useful commands

- `npm run build` compile typescript to js
- `npm run watch` watch for changes and compile
- `npm run test ` perform the jest unit tests
- `npm run deploy` deploy this stack to your default AWS account/region
- `cdk diff` compare deployed stack with current state
- `cdk synth` emits the synthesized CloudFormation template
