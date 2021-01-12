const AWS = require("aws-sdk");
import { APIGatewayProxyEvent } from "aws-lambda";
const eventbridge = new AWS.EventBridge();

exports.handler = async (event: APIGatewayProxyEvent) => {
  // Do some work...
  // And now create the event...

  const { params } = require("./events.js");

  console.log("--- Params ---");
  console.log(params);
  const result = await eventbridge.putEvents(params).promise();

  console.log("--- Response ---");
  console.log(result);
};
