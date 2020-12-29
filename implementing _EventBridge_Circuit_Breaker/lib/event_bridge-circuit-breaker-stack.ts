import * as cdk from "@aws-cdk/core";
import * as lambda from "@aws-cdk/aws-lambda";
import { ApiGatewayToLambda } from "@aws-solutions-constructs/aws-apigateway-lambda";
import * as api from "@aws-cdk/aws-apigateway";
import * as Iam from "@aws-cdk/aws-iam";
import { LambdaToDynamoDB } from "@aws-solutions-constructs/aws-lambda-dynamodb";
import * as dynamodb from "@aws-cdk/aws-dynamodb";
import { GlobalSecondaryIndexProps } from "@aws-cdk/aws-dynamodb";
import { EventsRuleToLambda } from "@aws-solutions-constructs/aws-events-rule-lambda";

export class EventBridgeCircuitBreakerStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const api_to_lambda = new ApiGatewayToLambda(this,"ApiGatewayToLambdaPattern",{
        lambdaFunctionProps: {
          runtime: lambda.Runtime.NODEJS_12_X,
          handler: "lambda.handler",
          code: lambda.Code.fromAsset(`lambda/webService`),
        },
        apiGatewayProps: {
          defaultMethodOptions: {
            authorizationType: api.AuthorizationType.NONE,
          },
        },
      }
    );

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

    let eventPolicy = new Iam.PolicyStatement({
      effect: Iam.Effect.ALLOW,
      resources: ["*"],
      actions: ["events:PutEvents"],
    });

    api_to_lambda.lambdaFunction.addToRolePolicy(eventPolicy);

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

    const secondaryIndex: GlobalSecondaryIndexProps = {
      indexName: "UrlIndex",
      partitionKey: { name: "SiteUrl", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "ExpirationTime", type: dynamodb.AttributeType.NUMBER },
    };

    lambda_to_dynamodb.dynamoTable.addGlobalSecondaryIndex(secondaryIndex);
    lambda_to_dynamodb.dynamoTable.grantFullAccess(event_lambda.lambdaFunction);

    new cdk.CfnOutput(this, "api", {
      value: `${api_to_lambda.apiGateway.url}`,
    });

    new cdk.CfnOutput(this, "tableName", {
      value: `${lambda_to_dynamodb.dynamoTable.tableName}`,
    });
  }
}
