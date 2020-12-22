import { APIGatewayProxyEvent } from "aws-lambda";
exports.handler = async (event: APIGatewayProxyEvent) => {
  console.log("--- Unapproved transactions ---");
  console.log(JSON.stringify(event, null, 2));
};
