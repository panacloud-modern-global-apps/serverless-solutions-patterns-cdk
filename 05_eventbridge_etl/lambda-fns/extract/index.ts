const AWS = require("aws-sdk");
import { APIGatewayProxyEvent } from "aws-lambda";
import { format } from "path";

const S3 = new AWS.S3();
const eventbridge = new AWS.EventBridge();

exports.handler = async (event: any) => {
  console.log(JSON.stringify(event, null, 2));

  let records: any[] = event.Records;
  /**
   * An event can contain multiple records to process. i.e. the user could have uploaded 2 files.
   */
  for (let index in records) {
    let payload = JSON.parse(records[index].body);
    console.log("processing s3 events " + JSON.stringify(payload, null, 2));

    let s3eventRecords = payload.Records;

    for (let i in s3eventRecords) {
      let s3event = s3eventRecords[i];
      console.log("s3 event " + JSON.stringify(s3event, null, 2));

      //Extract variables from event
      const objectKey = s3event?.s3?.object?.key;
      const bucketName = s3event?.s3?.bucket?.name;
      const bucketARN = s3event?.s3?.bucket?.arn;

      const params = {
        Bucket: bucketName,
        Key: objectKey,
      };
      const local_file = "/tmp/data.tsv";
      const csvData: any[] = [];
      const s3csvData = await S3.getObject(params).promise();
      const contents = s3csvData.Body.toString("utf-8");
      console.log(contents);
      const lines = contents
        .split(/\r\n/) // Convert to one string per line
        .map(function (lineStr: string) {
          return lineStr.split(","); // Convert each line to array (,)
        });
      const headers = lines[0];
      const linesWithoutHeader = lines.slice(1);

      for (let index in linesWithoutHeader) {
        const eventParams = {
          Entries: [
            {
              // Event envelope fields
              Source: "myETLapp",
              EventBusName: "ETLEventBus",
              DetailType: "EtlProcess",
              Time: new Date(),
              // Main event body
              Detail: JSON.stringify({
                status: "extracted",
                headers: headers,
                data: linesWithoutHeader[index],
              }),
            },
          ],
        };
        const result = await eventbridge
          .putEvents(eventParams)
          .promise()
          .then((data: any) => {
            console.log("Success");
          })
          .catch((err: any) => {
            console.log(err);
          });
      }
    }
  }
};
