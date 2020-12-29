const AWS = require("aws-sdk");
AWS.config.region = process.env.AWS_REGION || "us-east-2";
const eventbridge = new AWS.EventBridge();
export {};

const ERROR_THRESHOLD = 3;
const serviceURL = "www.google.com";
let response: any;

exports.handler = async (event: any, context: any) => {
  // create AWS SDK clients
  const dynamo = new AWS.DynamoDB();
  const secondsSinceEpoch = Math.round(Date.now() / 1000);

  // We are querying our error Dynamo to count how many errors are in there for www.google.com
  var dynamoParams = {
    ExpressionAttributeValues: {
      ":v1": { S: serviceURL },
      ":now": { N: secondsSinceEpoch.toString() },
    },
    KeyConditionExpression: "SiteUrl = :v1 and ExpirationTime > :now",
    IndexName: "UrlIndex",
    TableName: "circuitBreaker",
  };

  const recentErrors = await dynamo.query(dynamoParams).promise();

  console.log("--- Recent Errors ---");
  console.log(recentErrors.Count);
  console.log(JSON.stringify(recentErrors));

  // If we are within our error threshold, make the http call
  if (recentErrors.Count < ERROR_THRESHOLD) {
    let errorType = "";

    // In here assume we made an http request to google and it was down,
    // 10 sec hard coded delay for simulation
    const fakeServiceCall = await new Promise((resolve, reject) => {
      console.log("--- Calling Webservice, recent errors below threshold ---");

      setTimeout(function () {
        reject("service timeout exception")
      }, 10000)
    }).catch((reason) => {
      console.log('--- Service Call Failure ---');
      console.log(reason);
      errorType = reason;
    });

    // Building our failure event for EventBridge
    var params = {
      Entries: [
        {
          EventBusName: "default",
          Source: "eventBridge.circuitBreaker",
          DetailType: "httpcall",
          Detail: JSON.stringify({
            status: "fail",
            siteUrl: serviceURL,
            errorType: errorType,
          }),
        },
      ],
    };

    const result = await eventbridge.putEvents(params).promise();

    console.log("--- EventBridge Response ---");
    console.log(result);
    response = sendRes(500, "Something appears to be wrong with this service, please try again later");
  } else {
    console.log("Circuit currently closed, sending back failure response");
    response = sendRes(500, "This service has been experiencing issues for a while, we have closed the circuit");
  }

  return response;
};

const sendRes = (status: any, body: any) => {
  let response = {
    statusCode: status,
    headers: {
      "Content-Type": "text/html",
    },
    body: body,
  };
  return response;
};
