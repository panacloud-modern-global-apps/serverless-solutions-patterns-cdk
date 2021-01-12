import * as cdk from "@aws-cdk/core";
import * as lambda from "@aws-cdk/aws-lambda";
import * as ddb from "@aws-cdk/aws-dynamodb";
import * as apigw from "@aws-cdk/aws-apigateway";
import iam = require("@aws-cdk/aws-iam");
import {
  ApiGatewayToDynamoDBProps,
  ApiGatewayToDynamoDB,
} from "@aws-solutions-constructs/aws-apigateway-dynamodb";
import { DynamoDBStreamToLambda } from "@aws-solutions-constructs/aws-dynamodb-stream-lambda";
import { SqsDlq } from "@aws-cdk/aws-lambda-event-sources";

export class ImplementingTheDynamoStreamerArchitectureStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //Apigateway to DynamoDB pattern
    const apigateway_to_dynamodb: ApiGatewayToDynamoDBProps = {
      dynamoTableProps: {
        partitionKey: {
          name: "message",
          type: ddb.AttributeType.STRING,
        },
        encryption: ddb.TableEncryption.DEFAULT,
        stream: ddb.StreamViewType.NEW_IMAGE,
        pointInTimeRecovery: false,
      },
      allowCreateOperation: true,
      allowReadOperation: true,
      apiGatewayProps: {
        apiKeySourceType: apigw.ApiKeySourceType.HEADER,

        deployOptions: {
          stageName: "prod",
          loggingLevel: apigw.MethodLoggingLevel.INFO,
        },
      },
    };

    const ApiGateway_to_dynamodb_init = new ApiGatewayToDynamoDB(
      this,
      "test_apigatway_to_dynamodb",
      apigateway_to_dynamodb
    );

    // DynamoDb streams to lambda pattern
    const dynamoStreams_to_lambda = new DynamoDBStreamToLambda(
      this,
      "test-dynamodb-stream-lambda",
      {
        existingTableObj: ApiGateway_to_dynamodb_init.dynamoTable,
        lambdaFunctionProps: {
          code: lambda.Code.fromAsset(`lambda-fns`),
          runtime: lambda.Runtime.NODEJS_12_X,
          handler: "index.handler",
        },
      }
    );

    //Give our gateway permissions to interact with dynamodb
    let apigwDynamoRole = new iam.Role(this, "DefaultLambdaHanderRole", {
      assumedBy: new iam.ServicePrincipal("apigateway.amazonaws.com"),
    });
    ApiGateway_to_dynamodb_init.dynamoTable.grantReadWriteData(apigwDynamoRole);

    //Because this isn't a proxy integration, we need to define our response model
    const responseModel = ApiGateway_to_dynamodb_init.apiGateway.addModel(
      "ResponseModel",
      {
        contentType: "application/json",
        modelName: "ResponseModel",
        schema: {
          schema: apigw.JsonSchemaVersion.DRAFT4,
          title: "pollResponse",
          type: apigw.JsonSchemaType.OBJECT,
          properties: { message: { type: apigw.JsonSchemaType.STRING } },
        },
      }
    );
    // We define the JSON Schema for the transformed error response
    const errorResponseModel = ApiGateway_to_dynamodb_init.apiGateway.addModel(
      "ErrorResponseModel",
      {
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
      }
    );

    ApiGateway_to_dynamodb_init.apiGateway.root
      .addResource("InsertItem")
      .addMethod(
        "POST",
        new apigw.Integration({
          type: apigw.IntegrationType.AWS, //native aws integration
          integrationHttpMethod: "POST",
          uri: "arn:aws:apigateway:us-east-2:dynamodb:action/PutItem", // This is how we setup a dynamo insert operation.
          options: {
            credentialsRole: apigwDynamoRole,
            requestTemplates: {
              // This is the VTL to transform our incoming JSON to a Dynamo Insert query
              // Check: https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html
              "application/json": JSON.stringify({
                TableName: ApiGateway_to_dynamodb_init.dynamoTable.tableName,
                Item: { message: { S: "$input.path('$.message')" } },
              }),
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
                    message: "item added to db",
                  }),
                },
              },
              {
                // For errors, we check if the response contains the words BadRequest
                selectionPattern: "^[BadRequest].*",
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
  }
}
