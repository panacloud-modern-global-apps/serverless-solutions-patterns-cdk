import { APIGatewayProxyEvent } from "aws-lambda";

exports.handler = async (event: APIGatewayProxyEvent) => {
  console.log("--- Approved transactions ---");
  console.log(JSON.stringify(event, null, 2));
};
