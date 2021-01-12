[Getting Started](https://docs.aws.amazon.com/solutions/latest/constructs/getting-started-with-aws-solutions-constructs.html)

Go to this repo and find out what is the latest release version of aws solution constructs

https://github.com/awslabs/aws-solutions-constructs

Install the CDK version compatible with version of solution constructs

npm install -g aws-cdk@1.75.0

mkdir aws00_hello_constructs    
  
cd aws00_hello_constructs     

cdk init --language typescript

npm i

npm i @types/aws-lambda@1.75.0

Write lambda function in lambda/hello.ts

npm i @aws-cdk/aws-lambda@1.75.0

npm i @aws-cdk/aws-apigateway@1.75.0

npm i @aws-solutions-constructs/aws-apigateway-lambda@1.75.0

Write the stack in lib/aws00_hello_constructs-stack.ts

npm run build

cdk deploy

This your lambda:

curl https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/prod/

cdk destroy


