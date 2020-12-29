const AWS = require('aws-sdk')
const ddb = new AWS.DynamoDB();
export{}

exports.handler = async function(event:any) {
    console.log("hello from failure lambda request :", JSON.stringify(event, null, 2));
    const EpouchTime = Math.round(Date.now() / 1000);
    const expirationTime = ''+(EpouchTime + 60);
    
    var params = {
      TableName: "circuitBreaker",
      Item:{
        'RequestID' : {S: Math.random().toString(36).substring(2) + Date.now().toString(36)},
        'SiteUrl' : {S: event.detail.siteUrl},
        'ErrorType': {S: event.detail.errorType},
        'ExpirationTime': {N: expirationTime}
      }
    };
    // Call DynamoDB to add the item to the table
    let result = await ddb.putItem(params).promise();
    console.log(result);
  };        
      