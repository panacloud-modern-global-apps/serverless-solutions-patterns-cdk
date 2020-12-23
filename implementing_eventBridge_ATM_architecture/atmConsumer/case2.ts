import { APIGatewayProxyEvent } from "aws-lambda";

exports.handler = async (event: APIGatewayProxyEvent) => {
  console.log("--- NY location transactions ---");
  console.log(JSON.stringify(event, null, 2));
};
