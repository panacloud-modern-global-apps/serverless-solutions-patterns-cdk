## The Big Fan 
![big fan](https://github.com/cdk-patterns/serverless/blob/master/the-big-fan/img/the-big-fan-arch.png)
This is an example cdk stack to deploy "The Big Fan" from Heitor Lessa as seen in these [re:Invent slides](https://d1.awsstatic.com/events/reinvent/2019/REPEAT_3_Serverless_architectural_patterns_and_best_practices_ARC307-R3.pdf) or this [Youtube Recording](https://www.youtube.com/watch?v=9IYpGTS7Jy0) from Heitor Lessa.

In this example we have an API Gateway with a "/SendEvent" endpoint that takes a POST request with a JSON payload. The payload formats are beneath.

When API Gateway receives the json it automatically through VTL routes it to an SNS Topic, this Topic then has two subscribers which are SQS Queues. The difference between the two subscribers is that one looks for a property of "status":"created" in the json and the other subscriber looks for any message that doesn't have that property. Each queue has a lambda that subscribes to it and prints whatever message it recieves to cloudwatch.

## Let's Dive in the Code
#### Step 1 
Initialize your cdk project
```
cdk init --language=typescipt
```
#### Step 2
Download the dependencies
```
npm install @aws-solutions-constructs/aws-sqs-lambda @aws-cdk/aws-sns @aws-cdk/aws-sns-subscriptions @aws-cdk/aws-iam @aws-cdk/aws-apigateway @aws-cdk/aws-lambda
```
#### Step 3
Now let's break the stack code and understand each construct

  1. First we will define SNS Topic
  ```javascript
  const topic = new sns.Topic(this, "theBigFanTopic", {
      displayName: "TheBigFanArchitectureStack",
    });
  ```
  2. Create SQS Subscribers for our SNS Topic using [SqsToLambda](https://docs.aws.amazon.com/solutions/latest/constructs/aws-sqs-lambda.html).
   - Status:created SNS Subscriber Queue and also add SQS subcription
   ```javascript
       const createdStatusQueue = new SqsToLambda(this, "createdStatusQueue", {
      lambdaFunctionProps: {
        runtime: lambda.Runtime.NODEJS_10_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset("lambda/created"),
      },
      queueProps: {
        visibilityTimeout: cdk.Duration.seconds(300),
        queueName: "BigFanTopicStatusCreatedSubscriberQueue",
      },
    });
    
    // Only send messages to our createdStatusQueue with a status of created
    topic.addSubscription(
      new sns_sub.SqsSubscription(createdStatusQueue.sqsQueue, {
        rawMessageDelivery: true,
        filterPolicy: {
          status: sns.SubscriptionFilter.stringFilter({
            whitelist: ["created"],
          }),
        },
      })
    );
   ```
   - Any other status SNS Subscriber Queue and also add SQS subcription
   ```javascript
   const anyOtherStatusQueue = new SqsToLambda(this, "anyOtherStatusQueue", {
      lambdaFunctionProps: {
        runtime: lambda.Runtime.NODEJS_10_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset("lambda/anyOther"),
      },
      queueProps: {
        visibilityTimeout: cdk.Duration.seconds(300),
        queueName: "BigFanTopicAnyOtherStatusSubscriberQueue",
      },
    });

    // Only send messages to our anyOtherStatusQueue that do not have a status of created
    topic.addSubscription(
      new sns_sub.SqsSubscription(anyOtherStatusQueue.sqsQueue, {
        rawMessageDelivery: true,
        filterPolicy: {
          status: sns.SubscriptionFilter.stringFilter({
            blacklist: ["created"],
          }),
        },
      })
    );
   ```
  #### Step 4
  Give our gateway permissions to interact with SNS
  ```javascript
     let apigwSnsRole = new iam.Role(this, "DefaultLambdaHanderRole", {
      assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
    });
    topic.grantPublish(apigwSnsRole);
  ```
  
  #### Step 5
  Since we don't have any AWS Solution Construct to Connect API-gateway with SNS directly so we do that manually by using (L2 Constructs).
  ```javascript
  let gateway = new apigw.RestApi(this, "theBigFanAPI", {
      deployOptions: {
        metricsEnabled: true,
        loggingLevel: apigw.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        stageName: "prod",
      },
    });
  //Because this isn't a proxy integration, we need to define our response model
    const responseModel = gateway.addModel("ResponseModel", {
      contentType: "application/json",
      modelName: "ResponseModel",
      schema: {
        schema: apigw.JsonSchemaVersion.DRAFT4,
        title: "pollResponse",
        type: apigw.JsonSchemaType.OBJECT,
        properties: { message: { type: apigw.JsonSchemaType.STRING } },
      },
    });

    // We define the JSON Schema for the transformed error response
    const errorResponseModel = gateway.addModel("ErrorResponseModel", {
      contentType: "application/json",
      modelName: "ErrorResponseModel",
      schema: {
        schema: apigw.JsonSchemaVersion.DRAFT4,
        title: "errorResponse",
        type: apigw.JsonSchemaType.OBJECT,
        properties: {
          state: { type: apigw.JsonSchemaType.STRING },
          message: { type: apigw.JsonSchemaType.STRING },
        },
      },
    });

    //Create an endpoint '/InsertItem' which accepts a JSON payload on a POST verb
    gateway.root.addResource("SendEvent").addMethod(
      "POST",
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
              topic.topicArn +
              "')&" +
              "Message=$util.urlEncode($input.path('$.message'))&" +
              "Version=2010-03-31&" +
              "MessageAttributes.entry.1.Name=status&" +
              "MessageAttributes.entry.1.Value.DataType=String&" +
              "MessageAttributes.entry.1.Value.StringValue=$util.urlEncode($input.path('$.status'))",
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
                  message: "message added to topic",
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
                  message:
                    "$util.escapeJavaScript($input.path('$.errorMessage'))",
                }),
              },
              responseParameters: {
                "method.response.header.Content-Type": "'application/json'",
                "method.response.header.Access-Control-Allow-Origin": "'*'",
                "method.response.header.Access-Control-Allow-Credentials":
                  "'true'",
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
  #### Step 5
  Status:created or Status:otherThanCreated Lambdas will check the events records and console the body.
  ```javascript
  exports.handler = async function (event: any) {
  console.log("request:", JSON.stringify(event, undefined, 2));

  let records: any[] = event.Records;

  for (let index in records) {
    let payload = records[index].body;
    console.log("received message " + payload);
  }
};

  ```
#### Step 5
Let's deploy it.
```
npm run build && cdk deploy 
```

## Test 
Since our project is complete it's time to test it for that, follow the steps below:
#### JSON Payload Format
To send to the first lambda `{ "message": "hello", "status": "created" }`

To send to the second lambda `{ "message": "hello", "status": "not created" }`

#### Postman Example
![postman](https://github.com/cdk-patterns/serverless/blob/master/the-big-fan/img/postman.png)
## Useful commands

 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `npm run test`    perform the jest unit tests
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template
