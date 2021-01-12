# Serverless Solution and Architecture Patterns with CDK
`Note: It is very likely that you will have to rename references to files inside the bin and lib directories because folders were renamed. Also there is usually a problem when using the L3 constructs with the latest version of the CDK, so try to make sure that your cdk version is the same as the version of the construct you are using.`

## Our Goal:

When we are defining our infrastructure with AWS CDK we notice that there are certain combinations of resources that we use in multiple places. AWS took advantage of this fact by providing some pre built constructs that include these common bunches of constructs like combining sqs and lambda etc. AWS provides us a library of such reusable L3 patterns which are already set with best practice default values so we can quickly just install them and use them without having to look up proper settings and permissions to glue them together.

This repo aims to show how we can use the AWS Solutions Constructs library like puzzle pieces when we want to implement a certain larger architecture. As examples of larger architectures we decided to use the patterns provided by CDKpatterns. However it is also reasonable to come up with your own large architectures and then browse through the solutions library to see which pieces can fit for your use case.

### Basic Breakdown of methodology

Pick a complex architecture, browse through the solutions constructs library and choose the constructs that you think are relevant and then glue them together and show how they are used.

## List of Useful Solutions Constructs

- [API Gateway-DynamoDB](https://docs.aws.amazon.com/solutions/latest/constructs/aws-apigateway-dynamodb.html)
- [API Gateway-Lambda](https://docs.aws.amazon.com/solutions/latest/constructs/aws-apigateway-lambda.html)
- [API Gateway-SQS](https://docs.aws.amazon.com/solutions/latest/constructs/aws-apigateway-sqs.html)
- [Cloudfront-API Gateway](https://docs.aws.amazon.com/solutions/latest/constructs/aws-cloudfront-apigateway.html)
- [Cloudfront-API Gateway-Lambda](https://docs.aws.amazon.com/solutions/latest/constructs/aws-cloudfront-apigateway-lambda.html)
- [Cloudfront-S3](https://docs.aws.amazon.com/solutions/latest/constructs/aws-cloudfront-s3.html)
- [Cognito-API Gateway-Lambda](https://docs.aws.amazon.com/solutions/latest/constructs/aws-cognito-apigateway-lambda.html)
- [DynamoDB Streams - Lambda](https://docs.aws.amazon.com/solutions/latest/constructs/aws-dynamodb-stream-lambda.html)
- [DynamoDB Streams- Lambda - Elasticsearch+Kibana](https://docs.aws.amazon.com/solutions/latest/constructsaws-dynamodb-stream-lambda-elasticsearch-kibana.html)
- [Events Rule - Step Functions](https://docs.aws.amazon.com/solutions/latest/constructs/aws-events-rule-step-function.html)
- [Lambda - Step functions](https://docs.aws.amazon.com/solutions/latest/constructs/aws-lambda-step-function.html)

## Resources

[AWS Solutions Constructs – A Library of Architecture Patterns for the AWS CDK](https://aws.amazon.com/blogs/aws/aws-solutions-constructs-a-library-of-architecture-patterns-for-the-aws-cdk/)

[AWS Solution Constructs](https://aws.amazon.com/solutions/constructs/)

[AWS Solutions Constructs API](https://docs.aws.amazon.com/solutions/latest/constructs/welcome.html)

[AWS Solutions Constructs on GitHub](https://github.com/awslabs/aws-solutions-constructs)

[CDK Patterns at 20! Let's Walk Through all 20 Serverless Patterns for AWS](https://dev.to/nideveloper/cdk-patterns-at-20-let-s-walk-through-all-20-serverless-patterns-for-aws-d1n)
