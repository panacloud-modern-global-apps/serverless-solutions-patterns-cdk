# Serverless Solution and Architecture Patterns with CDK

## Our Goal:

When we are defining our infrastructure with AWS CDK we notice that there are certain combinations of resources that we use in multiple places. AWS took advantage of this fact by providing some pre built constructs that include these common bunches of constructs like combining sqs and lambda etc. AWS provides us a library of such reusable L3 patterns which are already set with best practice default values so we can quickly just install them and use them without having to look up proper settings and permissions to glue them together.

This repo aims to show how we can use the AWS Solutions Constructs library like puzzle pieces when we want to implement a certain larger architecture. As examples of larger architectures we decided to use the patterns provided by CDKpatterns. However it is also reasonable to come up with your own large architectures and then browse through the solutions library to see which pieces can fit for your use case.

## Resources

[AWS Solutions Constructs – A Library of Architecture Patterns for the AWS CDK](https://aws.amazon.com/blogs/aws/aws-solutions-constructs-a-library-of-architecture-patterns-for-the-aws-cdk/)

[AWS Solution Constructs](https://aws.amazon.com/solutions/constructs/)

[AWS Solutions Constructs API](https://docs.aws.amazon.com/solutions/latest/constructs/welcome.html)

[AWS Solutions Constructs on GitHub](https://github.com/awslabs/aws-solutions-constructs)

[CDK Patterns at 20! Let's Walk Through all 20 Serverless Patterns for AWS](https://dev.to/nideveloper/cdk-patterns-at-20-let-s-walk-through-all-20-serverless-patterns-for-aws-d1n)
