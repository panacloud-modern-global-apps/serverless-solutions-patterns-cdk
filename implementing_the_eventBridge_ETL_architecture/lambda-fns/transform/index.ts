import * as AWS from "aws-sdk";

const eventbridge = new AWS.EventBridge();

exports.handler = async (event: any) => {
  const headers: string[] = event.detail.headers;

  console.log("headers");
  console.log(headers.join(", "));

  const data: string = event.detail.data;
  console.log("data");
  console.log(JSON.stringify(data, null, 2));

  let transformedObject: any = {};

  for (let index in headers) {
    transformedObject[headers[index]] = data[index];
  }
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
          status: "transformed",
          data: transformedObject,
        }),
      },
    ],
  };
  await eventbridge
    .putEvents(eventParams)
    .promise()
    .then((data: any) => {
      console.log("Success");
    })
    .catch((err: any) => {
      console.log(err);
    });

  console.log(JSON.stringify(transformedObject, null, 2));
};
