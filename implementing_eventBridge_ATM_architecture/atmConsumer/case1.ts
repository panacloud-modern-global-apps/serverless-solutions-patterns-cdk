import { APIGatewayProxyEvent } from "aws-lambda";

exports.handler = async (event: APIGatewayProxyEvent) => {
  console.log("--- S3 Csv Data ---");
  console.log(JSON.stringify(event, null, 2));
};
