const AWS = require("aws-sdk");
import { APIGatewayProxyEvent } from "aws-lambda";
import * as fs from "fs";
import * as parse from "csv-parse";

const S3 = new AWS.S3();

exports.handler = async (event: any) => {
  console.log("hello world");
  console.log(JSON.stringify(event, null, 2));

  let records: any[] = event.Records;
  /**
   * An event can contain multiple records to process. i.e. the user could have uploaded 2 files.
   */
  for (let index in records) {
    let payload = JSON.parse(records[index].body);
    console.log("processing s3 events " + JSON.stringify(payload, null, 2));

    let s3eventRecords = payload.Records;

    console.log("records " + s3eventRecords);

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
      const header = lines[0];
      const linesWithoutHeader = lines.slice(1);
      console.log(linesWithoutHeader);
      console.log(JSON.stringify(linesWithoutHeader, null, 2));
      console.log(JSON.stringify(header, null, 2));
    }
  }
};

// const csvData = await S3.getObject(params).promise();

// .createReadStream()
// .pipe(
//   parse({
//     delimiter: ",",
//   })
// )
// .on("data", (dataRow: any) => {
//   csvData.push(dataRow);
// })
// .on("end", () => {
//   console.log(csvData);
// });
