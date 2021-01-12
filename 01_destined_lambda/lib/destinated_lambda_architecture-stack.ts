import * as cdk from "@aws-cdk/core";
import * as Iam from "@aws-cdk/aws-iam";
import * as apigw from "@aws-cdk/aws-apigateway";
import * as lambda from "@aws-cdk/aws-lambda";
import { EventsRuleToLambda } from "@aws-solutions-constructs/aws-events-rule-lambda";
import * as events from "@aws-cdk/aws-events";
import * as destinations from "@aws-cdk/aws-lambda-destinations";
import { SnsToLambda } from "@aws-solutions-constructs/aws-sns-lambda";

export class DestinatedLambdaArchitectureStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const eventbus = new events.EventBus(this, "EventBus", {
      eventBusName: "destinatedLambdaEventBus",
    });

    const sns_subs_lambda = new SnsToLambda(this, "snsLambda", {
      lambdaFunctionProps: {
        runtime: lambda.Runtime.NODEJS_12_X,
        handler: "main.handler",
        code: lambda.Code.fromAsset(`lambda`),
        onSuccess: new destinations.EventBridgeDestination(eventbus),
        onFailure: new destinations.EventBridgeDestination(eventbus),
      },
      topicProps: {
        displayName: "destinatedLambdaTopic",
      },
    });

    new EventsRuleToLambda(this, "successSnsLambdaRule", {
      lambdaFunctionProps: {
        runtime: lambda.Runtime.NODEJS_12_X,
        handler: "success.handler",
        code: lambda.Code.fromAsset(`lambda`),
      },
      eventRuleProps: {
        eventBus: eventbus,
        ruleName: "destinatedLambdaSuccessRule",
        eventPattern: {
          detail: {
            responsePayload: {
              source: ["sns"],
              action: ["success"],
            },
          },
        },
      },
    });

    new EventsRuleToLambda(this, "failureSnsLambdaRule", {
      lambdaFunctionProps: {
        runtime: lambda.Runtime.NODEJS_12_X,
        handler: "failure.handler",
        code: lambda.Code.fromAsset(`lambda`),
      },
      eventRuleProps: {
        eventBus: eventbus,
        ruleName: "destinatedLambdaFailureRule",
        eventPattern: {
          detail: {
            responsePayload: {
              errorType: ["Error"],
            },
          },
        },
      },
    });

    const gateway = new apigw.RestApi(this, "theDestinedLambdaAPI", {
      deployOptions: {
        metricsEnabled: true,
        loggingLevel: apigw.MethodLoggingLevel.INFO,
        dataTraceEnabled: true,
        stageName: "prod",
      },
    });

    let apigwSnsRole = new Iam.Role(this, "ApiGatewaySnsRole", {
      assumedBy: new Iam.ServicePrincipal("apigateway.amazonaws.com"),
    });

    sns_subs_lambda.snsTopic.grantPublish(apigwSnsRole);

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

    gateway.root.addResource("SendEvent").addMethod(
      "GET",
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
              sns_subs_lambda.snsTopic.topicArn +
              "')&" +
              "Message=please $input.params().querystring.get('mode')&" +
              "Version=2010-03-31",
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
                  message: "Message added to SNS topic",
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
  }
}
