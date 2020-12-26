import * as AWS from "aws-sdk";

const eventbridge = new AWS.EventBridge();

const ddbClient = new AWS.DynamoDB.DocumentClient();
exports.handler = async (event: any) => {
  const params: any = {
    TableName: process.env.DDB_TABLE_NAME,
    Item: {
      id: event.detail.data.ID,
      house_number: event.detail.data.HouseNum,
      street_address: event.detail.data.Street,
      town: event.detail.data.Town,
      zip: event.detail.data.Zip,
    },
  };

  // Call DynamoDB to add the item to the table
  let result = await ddbClient.put(params).promise();

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
          status: "success",
          data: params,
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
};
