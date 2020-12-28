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

We can use Fargate container to download the file from s3 rather than using Lambda because simple Lambda functions have a few limitations around memory, storage, and runtime. But you can now package and deploy Lambda functions as container images of up to 10 GB in size. In this way, you can also easily build and deploy larger workloads that rely on sizable dependencies,

## Let's Dive in the Code

Since you understand the architecture now I am going through the code to make you understand how you can implement this architecture using AWS cdk with Solutions Construct

## Step 1

Initialize your cdk project

```typescript
cdk init --language=typescipt
```

## Step 2

Download the dependencies
