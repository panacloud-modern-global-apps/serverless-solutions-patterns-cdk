## Introduction

In this example, you will learn how you can use EventBridge to orchestrate events through an ETL process with the help of AWS solutions constructs.

![ETL process](https://user-images.githubusercontent.com/50793209/103159616-35c73100-47ed-11eb-82a9-86fed39ff8f6.png)

### Understanding The Architecture

Before we start, let's talk about how the above architecture is working in a step by step

1. When a user puts CSV file in the s3 bucket then it will send the message(which contains information about the file and the bucket) to the SQS queue.

2. After that the `Extract Lambda` pulls the message from the queue and download that particular file (which the user uploaded) from the s3 bucket.

3. Then lambda puts each row as a separate event on to eventBridge. which are then send to `Transform Lambda`.

4. The `Transform Lambda` converts each row from CSV format to JSON format and sends the event back onto the eventBridge. where rule sends the sends event to the `Load Lambda`.

5. The `Load Lambda` puts the JSON into the dynamo DB table. after the record is inserted into dynamo DB, a final load event sends onto the eventBridge.

6. All of those events consumed by the `Observer Lambda` which writes every event to the cloudwatch.

### Architecture Notes

#### Throttling The Lambda Functions

Without throttling, if you put every row in a huge CSV file onto EventBridge with a subscriber lambda; That lambda can scale up until it uses all the concurrency on your account. This may be what you want (probably not though). That is why I limited all the concurrency of the lambdas, you can remove this limit or tweak as much as you want but you always need to think about what else is running in that account. Isolate your stack into its own account if possible.

#### Observer Lambda

In the current format, this is more of a technical demo to show what is possible with event-driven architectures. Everything that it logs is already in the logs of all the individual components. You could probably use this to keep a tally for every record that gets pulled from the csv to make sure it gets inserted into DynamoDB by pulling the ids from the extraction and load events.

#### When You Would Use This Pattern

If you need to create a process where a user uploads a csv and it gets transformed and inserted into DynamoDB

#### Referenece

[Learn more about the eventBridge ETL architecture](https://www.youtube.com/watch?v=8kg5bYsdem4)

#### Why we are not using fargate

We can use Fargate container to download the file from s3 rather than using Lambda because simple Lambda functions have a few limitations around memory, storage, and runtime. But you can now package and deploy Lambda functions as container images of up to 10 GB in size. In this way, you can also easily build and deploy larger workloads that rely on sizable dependencies.

## Let's Dive in the Code

Since you understand the architecture now I am going through the code to make you understand how you can implement this architecture using AWS cdk with Solutions Construct

## Step 1

Initialize your cdk project

```typescript
cdk init --language=typescipt
```

## Step 2

Download the dependencies
```bash
npm install @aws-cdk/aws-dynamodb @aws-cdk/aws-events @aws-cdk/aws-iam @aws-cdk/aws-lambda @aws-cdk/aws-lambda-destinations  @aws-cdk/aws-lambda-event-sources @aws-cdk/aws-ecr-assets @aws-cdk/aws-logs @aws-cdk/aws-s3 @aws-cdk/aws-sqs @aws-solutions-constructs/aws-events-rule-lambda @aws-solutions-constructs/aws-events-rule-step-function @aws-solutions-constructs/aws-s3-sqs @aws-solutions-constructs/aws-sqs-lambda
```
## Step 3
Now let's break the stack code and understand each construct
1. First define the throttle size which we will use to set the lambda concurrency limit.
```typescript
const LAMBDA_THROTTLE_SIZE = 2;
```   
2. Create DynamoDb construct
```typescript
 //Creating Dynamodb Table
    const ddbTable = new ddb.Table(this, "ddbTable", {
      billingMode: ddb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: "id",
        type: ddb.AttributeType.STRING,
      },
    });
```

3. Create an event bus.
```typescript
//Creating Event Bus
    const bus = new event.EventBus(this, "eventBus", {
      eventBusName: "ETLEventBus",
    });
```

4. Now Create [`aws-s3-sqs`](https://docs.aws.amazon.com/solutions/latest/constructs/aws-s3-sqs.html) pattern where you need define s3 and sqs props.
```typescript
   const s3_sqs_props: S3ToSqsProps = {
    queueProps: {
      visibilityTimeout: cdk.Duration.seconds(300),
      encryption: sqs.QueueEncryption.UNENCRYPTED,
    },
    bucketProps: {
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    },
    s3EventTypes: [s3.EventType.OBJECT_CREATED], //By default
  };
  const sqs_s3 = new S3ToSqs(this, "S3_To_Sqs", s3_sqs_props);
``` 

5. Create Iam policy for the `Extract Lambda Function`

```typescript
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
```
6. Next create [`aws-sqs-lambda`](https://docs.aws.amazon.com/solutions/latest/constructs/aws-sqs-lambda.html) solutions construct where we define lambda and sqs props but since we already created sqs in the previous step we will use the `existingQueueObj` property to define the existing queue.

```typescript
  //Creating aws-sqs-lambda solutions construct
  const sqs_lambda_props: SqsToLambdaProps = {
    existingQueueObj: sqs_s3.sqsQueue,
    lambdaFunctionProps: {
      runtime: lambda.Runtime.NODEJS_10_X,
      handler: "index.handler",
      code: lambda.Code.fromAsset(`lambda-fns/extract`),
      reservedConcurrentExecutions: LAMBDA_THROTTLE_SIZE,
      role: role,
      onSuccess: new lambdaDestination.EventBridgeDestination(bus),
    },
    deadLetterQueueProps: {
      encryption: sqs.QueueEncryption.UNENCRYPTED,
    },
  };
    const sqs_lambda = new SqsToLambda(this, "SqsToLambda", sqs_lambda_props);
```

7. Now create `Transform Lambda`, `Load Lambda` and `Observer Lambda` constructs, and give them required permission like `Transform Lambda` required permission to put events in the bus while `Load Lambda` required permissions to put events as well as DynamoDb full access so it can put data inside of it.

```typescript
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
      onSuccess: new lambdaDestination.EventBridgeDestination(bus),
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
    event.EventBus.grantPutEvents(transformFunc);
    // // Giving transformFunc Lambda permission to put events
    event.EventBus.grantPutEvents(loadFunc);
```

8. Create [`aws-events-rule-lambda`](https://docs.aws.amazon.com/solutions/latest/constructs/aws-events-rule-lambda.html) pattern for `Transform Lambda` and provide props of Lambda(which we created in the previous step) and rule. 
```typescript
  //Creatig solutions construct aws-events-rule-lambda for  transform lambda
  const event_rule_transform_lambda: EventsRuleToLambdaProps = {
    existingLambdaObj: transformFunc,
    eventRuleProps: {
      ruleName: "extractedDataRule",
      eventBus: bus,
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
    this,
    "test-events-rule-transform-lambda",
    event_rule_transform_lambda
  );
```
9. Similarly create a pattern for the other two lambda functions as well, i.e `Transform Lambda`
and `Load Lambda`

```typescript
  //Creatig solutions construct aws-events-rule-lambda for  load lambda
    const event_rule_load_lambda: EventsRuleToLambdaProps = {
      existingLambdaObj: loadFunc,
      eventRuleProps: {
        ruleName: "transformedDataRule",
        eventBus: bus,
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
      this,
      "test-events-rule-load-lambda",
      event_rule_load_lambda
    );

    //Creatig solutions construct aws-events-rule-lambda for  load lambda
    const event_rule_observe_lambda: EventsRuleToLambdaProps = {
      existingLambdaObj: observeFunc,
      eventRuleProps: {
        ruleName: "allStatusRule",
        eventBus: bus,
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
      this,
      "test-events-rule-observe-lambda",
      event_rule_observe_lambda
    );
```


## Step 4 
Create a folder `lambda-fns` in the root directory where you have to write the code for all lambda functions. as we already discussed what each lambda is doing. so let's directly dive into the code  

1. `Extracted Lambda` handler code.    
```typescript
const AWS = require("aws-sdk");
import { APIGatewayProxyEvent } from "aws-lambda";
import { format } from "path";

const S3 = new AWS.S3();
const eventbridge = new AWS.EventBridge();

exports.handler = async (event: any) => {
  console.log(JSON.stringify(event, null, 2));

  let records: any[] = event.Records;
  /**
   * An event can contain multiple records to process. i.e. the user could have uploaded 2 files.
   */
  for (let index in records) {
    let payload = JSON.parse(records[index].body);
    console.log("processing s3 events " + JSON.stringify(payload, null, 2));

    let s3eventRecords = payload.Records;

    for (let i in s3eventRecords) {
      let s3event = s3eventRecords[i];
      console.log("s3 event " + JSON.stringify(s3event, null, 2));

      //Extract variables from event
      const objectKey = s3event?.s3?.object?.key;
      const bucketName = s3event?.s3?.bucket?.name;
      const bucketARN = s3event?.s3?.bucket?.arn;

      const params = {
        Bucket: bucketName,
        Key: objectKey,
      };
      const local_file = "/tmp/data.tsv";
      const csvData: any[] = [];
      const s3csvData = await S3.getObject(params).promise();
      const contents = s3csvData.Body.toString("utf-8");
      console.log(contents);
      const lines = contents
        .split(/\r\n/) // Convert to one string per line
        .map(function (lineStr: string) {
          return lineStr.split(","); // Convert each line to array (,)
        });
      const headers = lines[0];
      const linesWithoutHeader = lines.slice(1);

      for (let index in linesWithoutHeader) {
        const eventParams = {
          Entries: [
            {
              // Event envelope fields
              Source: "myETLapp",
              EventBusName: "ETLEventBus",
              DetailType: "EtlProcess",
              Time: new Date(),
              // Main event body
              Detail: JSON.stringify({
                status: "extracted",
                headers: headers,
                data: linesWithoutHeader[index],
              }),
            },
          ],
        };
        const result = await eventbridge
          .putEvents(eventParams)
          .promise()
          .then((data: any) => {
            console.log("Success");
          })
          .catch((err: any) => {
            console.log(err);
          });
      }
    }
  }
};
```
2. `Transform Lambda` handler code
```typescript
import * as AWS from "aws-sdk";

const eventbridge = new AWS.EventBridge();

exports.handler = async (event: any) => {
  const headers: string[] = event.detail.headers;

  console.log("headers");
  console.log(headers.join(", "));

  const data: string = event.detail.data;
  console.log("data");
  console.log(JSON.stringify(data, null, 2));

  let transformedObject: any = {};

  for (let index in headers) {
    transformedObject[headers[index]] = data[index];
  }
  const eventParams = {
    Entries: [
      {
        // Event envelope fields
        Source: "myETLapp",
        EventBusName: "ETLEventBus",
        DetailType: "EtlProcess",
        Time: new Date(),
        // Main event body
        Detail: JSON.stringify({
          status: "transformed",
          data: transformedObject,
        }),
      },
    ],
  };
  await eventbridge
    .putEvents(eventParams)
    .promise()
    .then((data: any) => {
      console.log("Success");
    })
    .catch((err: any) => {
      console.log(err);
    });

  console.log(JSON.stringify(transformedObject, null, 2));
};
```
3. `Load Lambda` handler code
```typescript
import * as AWS from "aws-sdk";

const eventbridge = new AWS.EventBridge();

const ddbClient = new AWS.DynamoDB.DocumentClient();
exports.handler = async (event: any) => {
  const params: any = {
    TableName: process.env.DDB_TABLE_NAME,
    Item: {
      id: event.detail.data.ID,
      house_number: event.detail.data.HouseNum,
      street_address: event.detail.data.Street,
      town: event.detail.data.Town,
      zip: event.detail.data.Zip,
    },
  };

  // Call DynamoDB to add the item to the table
  let result = await ddbClient.put(params).promise();

  const eventParams = {
    Entries: [
      {
        // Event envelope fields
        Source: "myETLapp",
        EventBusName: "ETLEventBus",
        DetailType: "EtlProcess",
        Time: new Date(),
        // Main event body
        Detail: JSON.stringify({
          status: "success",
          data: params,
        }),
      },
    ],
  };
  await eventbridge
    .putEvents(eventParams)
    .promise()
    .then((data: any) => {
      console.log("Success");
    })
    .catch((err: any) => {
      console.log(err);
    });
};
```

4. `Observer Lambda` handler code
```typescript
exports.handler = async (event: any) => {
  console.log(JSON.stringify(event, null, 2));
};
``` 

## Step 5
Now our project is ready to deploy on cloudformation

```bash
npm run build && cdk deploy
```

## Step 6
Since our project is completed it's time to test it so, for that, upload `csv file` in s3 bucket now head to cloudwatch events there you will see several log groups find observer lambda logs there you will find all the events generated by all lambda functions i.e `Extract Lambda`, `Transform Lambda` and `Load Lambda`. now move to DynamoDb, there you will find that your csv file data inserted into the table successfully. 

## Cleanup

```bash
cdk destroy
```
