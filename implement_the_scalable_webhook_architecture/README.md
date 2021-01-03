# The Scalable Webhook
This is an example CDK stack to deploy The Scalable Webhook stack described by Jeremy Daly [here](https://www.jeremydaly.com/serverless-microservice-patterns-for-aws/#scalablewebhook)
An advanced version of this pattern was talked about by Heitor Lessa at re:Invent 2019 as Call me, “Maybe” (Webhook)
- [Youtube Recording](https://www.youtube.com/watch?v=9IYpGTS7Jy0)
- [Slides](https://d1.awsstatic.com/events/reinvent/2019/REPEAT_3_Serverless_architectural_patterns_and_best_practices_ARC307-R3.pdf)
## High Level Description
You would use this pattern when you have a non serverless resource like an RDS DB in direct contact with a serverless resource like a lambda. You need to make sure that your serverless resource doesn't scale up to an amount that it DOS attacks your non serverless resource.

This is done by putting a queue between them and having a lambda with a throttled concurrency policy pull items off the queue and communicate with your serverless resource at a rate it can handle.
![arch](https://raw.githubusercontent.com/cdk-patterns/serverless/master/the-scalable-webhook/img/architecture.png)
**NOTE**: For this pattern in the cdk deployable construct I have swapped RDS for DynamoDB.

## Pattern Background
If we weren't using DynamoDB, we would need to know the max connections limit configured for our instance size:
![mysql](https://github.com/cdk-patterns/serverless/blob/master/the-scalable-webhook/img/mysql.png)
We need to slow down the amount of direct requests to our DB somehow, that is where the scalable webhook comes in:
![webhook](https://github.com/cdk-patterns/serverless/blob/master/the-scalable-webhook/img/scalable_webhook.png)
We can use SQS to hold all requests in a queue as soon as they come in. Again, SQS will have limits:
![sqs](https://github.com/cdk-patterns/serverless/blob/master/the-scalable-webhook/img/sqs.png)
Now we have our messages in a queue but we need to subscribe to the queue and insert the records into the DB. To do this we create a throttled lambda where we set the max number of concurrent executions to whatever scale we are happy with. This should be less than the max connections on our DB and should take into account any other Lambdas running in this account.
![throttle](https://github.com/cdk-patterns/serverless/blob/master/the-scalable-webhook/img/throttle.png)
One final improvement that we could make if implementing this in a production system is to delete the Lambda between the API Gateway and SQS. You can do a direct integration which will reduce costs and latency:
![more](https://github.com/cdk-patterns/serverless/blob/master/the-scalable-webhook/img/more_scalable_webhook.png)
## Let's Dive in the Code
#### Step 1
Initialize your cdk project
```
cdk init --language=typescipt
```
#### Step 2
Download the dependencies
```
npm install @aws-solutions-constructs/aws-apigateway-lambda @aws-cdk/aws-dynamodb @aws-cdk/aws-lambda-event-sources @aws-cdk/aws-sqs @aws-cdk/aws-lambda
```
#### Step 3
Now let's break the stack code and understand each construct.
  1. Create a DynamoDB Table.
  ```javascript
  // This is standing in for what is RDS on the diagram due to simpler/cheaper setup
    const table = new dynamodb.Table(this, "the-scalable-webhook-stack", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING }, //the key being id means we squash duplicate sqs messages
    });
  ```
  2. Creat a SQS Queue
  ```javascript
  const queue = new sqs.Queue(this, "RDSPublishQueue", {
      visibilityTimeout: cdk.Duration.seconds(300),
    });
  ```
  3. Just creating the role that will attach to the lambda function
  ```javascript
  //create a specific role for Lambda function
    const role = new Role(this, "LambdaRole", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
    });
```
4. Defining policy that will be granting access to all the operations of Sqs and all the cloudwatch logs events. Logs permissions are default but if we define a role to the resource so all the default policies will be override.
```javascript
    ///Attaching Sqs access to policy
    const policy = new PolicyStatement({
      effect: Effect.ALLOW,
      actions: ["sqs:*", "logs:*"],
      resources: ["*"],
    });

    //granting IAM permissions to role
    role.addToPolicy(policy);
 ```
 5. Create [ApiToLambda](https://docs.aws.amazon.com/solutions/latest/constructs/aws-apigateway-lambda.html) and also assigning role to lambda function
 ```javascript
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
 ```
 6. defines an AWS Lambda resource to pull from our queue
 ```javascript
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
 ```
  7. Grant premissions to Subscribe lambda
  ```javascript
    queue.grantConsumeMessages(sqsSubscribeLambda);
    sqsSubscribeLambda.addEventSource(new SqsEventSource(queue, {}));
    table.grantReadWriteData(sqsSubscribeLambda);
  ```
  #### Step 4 
  `lambda/publish` code. This Lambda Delivers a message to the specified queue.
  ```javascript
  var AWS = require("aws-sdk");

exports.handler = async function (event: any) {
  console.log("request:", JSON.stringify(event, undefined, 2));

  // Create an SQS service object
  var sqs = new AWS.SQS({ apiVersion: "2012-11-05" });

  var params = {
    DelaySeconds: 10,
    MessageAttributes: {
      MessageDeduplicationId: {
        DataType: "String",
        StringValue: event.path + new Date().getTime(),
      },
    },
    MessageBody: "hello from " + event.path,
    QueueUrl: process.env.queueURL,
  };

  let response;

  await sqs
    .sendMessage(params, function (err: any, data: any) {
      if (err) {
        console.log("Error", err);
        response = sendRes(500, err);
      } else {
        console.log("Success", data.MessageId);
        response = sendRes(
          200,
          "You have added a message to the queue! Message ID is " +
            data.MessageId
        );
      }
    })
    .promise();

  // return response back to upstream caller
  return response;
};

let sendRes = (status: number, body: string) => {
  var response = {
    statusCode: status,
    headers: {
      "Content-Type": "text/html",
    },
    body: body,
  };
  return response;
};

  ```
  #### Step 5 
  `lambda/subscribe` code. This Lambda will check the events records and put records into DynamoDB. 
  ```javascript
  const { DynamoDB } = require("aws-sdk");

exports.handler = async function (event: any) {
  console.log("request:", JSON.stringify(event, undefined, 2));

  let records: any[] = event.Records;
  // create AWS SDK clients
  const dynamo = new DynamoDB();

  for (let index in records) {
    let payload = records[index].body;
    let id =
      records[index].messageAttributes.MessageDeduplicationId.stringValue;
    console.log("received message " + payload);

    var params = {
      TableName: process.env.tableName,
      Item: {
        id: { S: id },
        message: { S: payload },
      },
    };

    // Call DynamoDB to add the item to the table
    await dynamo
      .putItem(params, function (err: any, data: any) {
        if (err) {
          console.log("Error", err);
        } else {
          console.log("Success", data);
        }
      })
      .promise();
  }
};

  ```
  #### Step 6
  Let's deploy it 
  ```javascript
  npm run build && cdk deploy 
  ```
## How to test pattern
When you deploy this you will have an API Gateway where any url is routed through to the publish lambda. If you modify the url from / to say /hello this url will be sent as a message via sqs to a lambda which will insert "hello from /hello" into dynamodb as a message. You can track the progress of your message at every stage through cloudwatch as logs are printed, you can view the contents of dynamo in the console and the contents of sqs in the console. You should also notice that SQS can include duplicate messages but in those instances you don't get two identical records in DynamoDB as we used an id we generated in the message as the key.

## Useful commands

 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `npm run test`    perform the jest unit tests
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template
