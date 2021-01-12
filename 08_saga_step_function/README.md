# The Saga Step Function

## What Is The Saga Pattern?

Hector Garcia-Molina described it in his paper as follows:

>Long lived transactions (LLTs) hold on to database resources for relatively long periods of time, signficantly delaying the termination of shorter and more common transactions To >alleviate these problems we propose the notion of a saga.
>
>A LLT is a saga if it can be written as a sequence of transactions that can be interleaved with other transactions. The database management system guarantees that either all the >transactions in a saga are successfully completed or compensating transactions are run to amend a partial execution.

You can think of this as a complete transaction is made up of a series of smaller tasks. We need all of these tasks to be successful for us to call the transaction a success.

Caitie uses a holiday booking example to demonstrate this which Yan elaborated on so let's continue the trend. If you are booking a holiday let's say you need at a minimum:

- To Book Flights
- To Book A hotel
- To Pay

You wouldn't be very happy if you booked a holiday then found out when you landed that you had a reservation at the hotel but an error occured with payment so they gave it away. The saga pattern forces you to have a compensating action for that payment error, either you have some other payment selection process or you roll back the whole booking and ask the customer to try again.

Every action must have a corresponding reaction for error. Note the reaction cannot always be equal as Caitie points out, if one of the actions was to send an email you cannot undo that send but you can send a follow up to say it was an error.

If we assume from this point we will roll back when an error hits then the flow might look something like:

### Success
This flows as you might expect - we reserve a room in the hotel, a spot on the plane, take the payment, then confirm the booking with the airline and hotel. Finally we notify the customer that it was a successful booking.
![success](https://github.com/cdk-patterns/serverless/blob/master/the-saga-stepfunction/img/success.png)

### Failure
If after reserving the flight and hotel our payment fails then we need to release that reservation and notify the customer it failed.

Notice how it peels back the layers, it doesn't do one massive compensation step. It runs the cancel steps in reverse order until the system should be the way it was before we started.
![fail](https://github.com/cdk-patterns/serverless/blob/master/the-saga-stepfunction/img/fail_payment.png)

If the first ReserveHotel task had failed the only difference is the number of Cancel tasks that run:
![hotel](https://github.com/cdk-patterns/serverless/blob/master/the-saga-stepfunction/img/fail_hotel.png)

### What Does The Saga Step Function Look Like?
We have an API Gateway connected to a Lambda through a {proxy+} setup. This lambda starts a stepfunction workflow representing the flows above. 8 lambdas inside that workflow communicate with 1 DynamoDB table to complete a travel booking transaction:
![arch](https://github.com/cdk-patterns/serverless/blob/master/the-saga-stepfunction/img/saga_architecture.png)

### Saga Lambda and Step Fuction Exection
The Saga Lambda is a function that takes in input from the query parameters in the url and passes them to a step function execution. The data passed to the step function looks like:

```javascript
let input = {
        "trip_id": tripID, //taken from queryParams
        "depart": "London",
        "depart_at": "2021-07-10T06:00:00.000Z",
        "arrive": "Dublin",
        "arrive_at": "2021-07-12T08:00:00.000Z",
        "hotel": "holiday inn",
        "check_in": "2021-07-10T12:00:00.000Z",
        "check_out": "2021-07-12T14:00:00.000Z",
        "rental": "Volvo",
        "rental_from": "2021-07-10T00:00:00.000Z",
        "rental_to": "2021-07-12T00:00:00.000Z",
        "run_type": runType //taken from queryParams
    };
```

### Error Handling and Retry Logic

If an error occurs in any of the reserve tasks, confirm tasks or the take payment task (either by you manually passing the trigger or a real error) we have step function catch logic to route to the appropriate cancel event.

You also need to account for errors in the cancel functions. That is why there is a random fail trigger in each cancel function. 

```javascript
if (Math.random() < 0.4) {
    throw new Error("Internal Server Error");
}
```

To handle this each cancel function has a built in retry policy of 3 attempts as part of the step function definition.

### DynamoDB Table

We have 3 separate entities inside the one DynamoDB table.

You can see that the sort key on our table is overloaded to allow us to effectively filter results:

![dynamo](https://github.com/cdk-patterns/serverless/blob/master/the-saga-stepfunction/img/dynamodb.png)

More columns exist than is shown above. The data inserted for each record is as follows:

```javascript
// Hotel Data Model
var params = {
    TableName: process.env.TABLE_NAME,
    Item: {
      'pk' : {S: event.trip_id},
      'sk' : {S: 'HOTEL#'+hotelBookingID},
      'trip_id' : {S: event.trip_id},
      'type': {S: 'Hotel'},
      'id': {S: hotelBookingID},
      'hotel' : {S: event.hotel},
      'check_in': {S: event.check_in},
      'check_out': {S: event.check_out},
      'transaction_status': {S: 'pending'}
    }
  };

// Flights Data Model
var params = {
      TableName: process.env.TABLE_NAME,
      Item: {
        'pk' : {S: event.trip_id},
        'sk' : {S: 'FLIGHT#'+flightBookingID},
        'type': {S: 'Flight'},
        'trip_id' : {S: event.trip_id},
        'id': {S: flightBookingID},
        'depart' : {S: event.depart},
        'depart_at': {S: event.depart_at},
        'arrive': {S: event.arrive},
        'arrive_at': {S: event.arrive_at},
        'transaction_status': {S: 'pending'}
      }
    };

// Payments Data Model
var params = {
      TableName: process.env.TABLE_NAME,
      Item: {
        'pk' : {S: event.trip_id},
        'sk' : {S: 'PAYMENT#'+paymentID},
        'type': {S: 'Payment'},
        'trip_id' : {S: event.trip_id},
        'id': {S: paymentID},
        'amount': {S: "450.00"},
        'currency': {S: "USD"},
        'transaction_status': {S: "confirmed"}
      }
    };
```

## Let's Dive in the Code
#### Step 1
Initialize your cdk project
```
cdk init --language=typescipt
```
#### Step 2
Download the dependencies
```
npm install @aws-solutions-constructs/aws-apigateway-lambda @aws-cdk/aws-dynamodb @aws-cdk/aws-stepfunctions-tasks @aws-cdk/aws-lambda @aws-cdk/aws-stepfunctions
```
#### Step 3
Now let's break the stack code and understand each construct.

 1.Create a DynamoDB Table.
 ```javascript
 const bookingsTable = new dynamodb.Table(this, "Bookings", {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
    });
 ```
 2. We Have to create 8 Lambdas, for that I have create a function where we can pass information related to lambda and grant permission for read and write.
 ```javascript
 let reserveFlightLambda = createLambda(
      this,
      "reserveFlightLambdaHandler",
      "flights/reserveFlight.handler",
      bookingsTable
    );
    let confirmFlightLambda = createLambda(
      this,
      "confirmFlightLambdaHandler",
      "flights/confirmFlight.handler",
      bookingsTable
    );
    let cancelFlightLambda = createLambda(
      this,
      "cancelFlightLambdaHandler",
      "flights/cancelFlight.handler",
      bookingsTable
    );

    // 2) Hotel
    let reserveHotelLambda = createLambda(
      this,
      "reserveHotelLambdaHandler",
      "hotel/reserveHotel.handler",
      bookingsTable
    );
    let confirmHotellambda = createLambda(
      this,
      "confirmHotelLambdaHandler",
      "hotel/confirmHotel.handler",
      bookingsTable
    );
    let cancelHotelLambda = createLambda(
      this,
      "cancelHotelLambdaHandler",
      "hotel/cancelHotel.handler",
      bookingsTable
    );

    // 3) Payment For Holiday
    let takePaymentLambda = createLambda(
      this,
      "takePaymentLambdaHandler",
      "payment/takePayment.handler",
      bookingsTable
    );
    let refundPaymentLambda = createLambda(
      this,
      "refundPaymentLambdaHandler",
      "payment/refundPayment.handler",
      bookingsTable
    );
    
    function createLambda(
      scope: cdk.Stack,
      id: string,
      handler: string,
      table: dynamodb.Table
    ) {
      // Create a Node Lambda with the table name passed in as an environment variable
      let fn = new lambda.Function(scope, id, {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromAsset("lambda-fns"),
        handler: handler,
        environment: {
          TABLE_NAME: table.tableName,
        },
      });
      // Give our Lambda permissions to read and write data from the passed in DynamoDB table
      table.grantReadWriteData(fn);

      return fn;
    }
 ```
 3. Define two end states for Step Function
 ```javascript
 const bookingFailed = new sfn.Fail(
      this,
      "Sorry, We Couldn't make the booking",
      {}
    );
    const bookingSucceeded = new sfn.Succeed(
      this,
      "We have made your booking!"
    );
 ```
4. Define Step Function tasks
```javascript
 // 1) Reserve Flights and Hotel

    const cancelHotelReservation = new sfn.Task(
      this,
      "CancelHotelReservation",
      {
        task: new tasks.RunLambdaTask(cancelHotelLambda),
        resultPath: "$.CancelHotelReservationResult",
      }
    )
      .addRetry({ maxAttempts: 3 }) // retry this task a max of 3 times if it fails
      .next(bookingFailed);

    const reserveHotel = new sfn.Task(this, "ReserveHotel", {
      task: new tasks.RunLambdaTask(reserveHotelLambda),
      resultPath: "$.ReserveHotelResult",
    }).addCatch(cancelHotelReservation, {
      resultPath: "$.ReserveHotelError",
    });

    const cancelFlightReservation = new sfn.Task(
      this,
      "CancelFlightReservation",
      {
        task: new tasks.RunLambdaTask(cancelFlightLambda),
        resultPath: "$.CancelFlightReservationResult",
      }
    )
      .addRetry({ maxAttempts: 3 }) // retry this task a max of 3 times if it fails
      .next(cancelHotelReservation);

    const reserveFlight = new sfn.Task(this, "ReserveFlight", {
      task: new tasks.RunLambdaTask(reserveFlightLambda),
      resultPath: "$.ReserveFlightResult",
    }).addCatch(cancelFlightReservation, {
      resultPath: "$.ReserveFlightError",
    });

    // 2) Take Payment
    const refundPayment = new sfn.Task(this, "RefundPayment", {
      task: new tasks.RunLambdaTask(refundPaymentLambda),
      resultPath: "$.RefundPaymentResult",
    })
      .addRetry({ maxAttempts: 3 }) // retry this task a max of 3 times if it fails
      .next(cancelFlightReservation);

    const takePayment = new sfn.Task(this, "TakePayment", {
      task: new tasks.RunLambdaTask(takePaymentLambda),
      resultPath: "$.TakePaymentResult",
    }).addCatch(refundPayment, {
      resultPath: "$.TakePaymentError",
    });

    // 3) Confirm Flight and Hotel booking
    const confirmHotelBooking = new sfn.Task(this, "ConfirmHotelBooking", {
      task: new tasks.RunLambdaTask(confirmHotellambda),
      resultPath: "$.ConfirmHotelBookingResult",
    }).addCatch(refundPayment, {
      resultPath: "$.ConfirmHotelBookingError",
    });

    const confirmFlight = new sfn.Task(this, "ConfirmFlight", {
      task: new tasks.RunLambdaTask(confirmFlightLambda),
      resultPath: "$.ConfirmFlightResult",
    }).addCatch(refundPayment, {
      resultPath: "$.ConfirmFlightError",
    });
```
5. Create Step Function definition
```javascript
 const definition = sfn.Chain.start(reserveHotel)
      .next(reserveFlight)
      .next(takePayment)
      .next(confirmHotelBooking)
      .next(confirmFlight)
      .next(bookingSucceeded);

```
6. Create Step Function State machine
```javascript
let saga = new sfn.StateMachine(this, "BookingSaga", {
      definition,
      timeout: cdk.Duration.minutes(5),
    });
```
7. Create Lambda RestAPI using [ApiToLambda](https://docs.aws.amazon.com/solutions/latest/constructs/aws-apigateway-lambda.html)
```javascript
const api = new ApiGatewayToLambda(this, "SagaPatternSingleTable", {
      lambdaFunctionProps: {
        runtime: lambda.Runtime.NODEJS_12_X,
        code: lambda.Code.fromAsset("lambda-fns"),
        handler: "sagaLambda.handler",
        environment: {
          statemachine_arn: saga.stateMachineArn,
        },
      },
    });
``` 
8. Grant start execution to Lambda function
```javascript
    saga.grantStartExecution(api.lambdaFunction);
```
#### Step 4
Lambdas Inside Our Step Function

| Author        | Description           |
| ------------- | ------------- |
| Reserve Hotel | Inserts a record into DynamoDB for our hotel booking with a transaction_status of pending |
| Reserve Flight | Inserts a record into DynamoDB for our flight booking with a transaction_status of pending |
| Cancel Hotel Reservation | Deletes the record from DynamoDB for our pending hotel booking |
| Cancel Flight Reservation | Deletes the record from DynamoDB for our pending Flight booking |
| Take Payment | Inserts a record into DynamoDB for the payment |
| Refund Payment | Deletes the record from DynamoDB for the payment |
| Confirm Hotel | Updates the record in DynamoDB for transaction_status to confirmed |
| Confirm Flight | Updates the record in DynamoDB for transaction_status to confirmed |

- `lambda-fns/hotel/reserveHotel.ts` code.

```javascript
const { DynamoDB } = require('aws-sdk');
exports.handler = async function(event:any) {
  console.log("request:", JSON.stringify(event, undefined, 2));

  let hotelBookingID = hashCode(''+event.trip_id+event.hotel+event.check_in);

  // If we passed the parameter to fail this step 
  if(event.run_type === 'failHotelReservation'){
    throw new Error("Failed to reserve the hotel");
  }

  // create AWS SDK clients
  const dynamo = new DynamoDB();

  var params = {
    TableName: process.env.TABLE_NAME,
    Item: {
      'pk' : {S: event.trip_id},
      'sk' : {S: 'HOTEL#'+hotelBookingID},
      'trip_id' : {S: event.trip_id},
      'type': {S: 'Hotel'},
      'id': {S: hotelBookingID},
      'hotel' : {S: event.hotel},
      'check_in': {S: event.check_in},
      'check_out': {S: event.check_out},
      'transaction_status': {S: 'pending'}
    }
  };
  
  // Call DynamoDB to add the item to the table
  let result = await dynamo.putItem(params).promise().catch((error: any) => {
    throw new Error(error);
  });

  console.log('inserted hotel booking:');
  console.log(result);

  // return status of ok
  return {
    status: "ok",
    booking_id: hotelBookingID
  }
};

function hashCode(s:string) {
  let h:any;

  for(let i = 0; i < s.length; i++){
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }

  return ''+Math.abs(h);
}
```
- `lambda-fns/flight/reserveFlight.ts` code.
```javascript
const { DynamoDB } = require('aws-sdk');
exports.handler = async function(event:any) {
  console.log("request:", JSON.stringify(event, undefined, 2));

  let flightBookingID = hashCode(''+event.trip_id+event.depart+event.arrive);

  // If we passed the parameter to fail this step 
  if(event.run_type === 'failFlightsReservation'){
      throw new Error('Failed to book the flights');
  }

  // create AWS SDK clients
  const dynamo = new DynamoDB();

  var params = {
      TableName: process.env.TABLE_NAME,
      Item: {
        'pk' : {S: event.trip_id},
        'sk' : {S: 'FLIGHT#'+flightBookingID},
        'type': {S: 'Flight'},
        'trip_id' : {S: event.trip_id},
        'id': {S: flightBookingID},
        'depart' : {S: event.depart},
        'depart_at': {S: event.depart_at},
        'arrive': {S: event.arrive},
        'arrive_at': {S: event.arrive_at},
        'transaction_status': {S: 'pending'}
      }
    };
  
  // Call DynamoDB to add the item to the table
  let result = await dynamo.putItem(params).promise().catch((error: any) => {
    throw new Error(error);
  });

  console.log('inserted flight booking:');
  console.log(result);

  // return status of ok
  return {
    status: "ok",
    booking_id: flightBookingID
  }
};

function hashCode(s:string) {
  let h:any;

  for(let i = 0; i < s.length; i++){
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }

  return ''+Math.abs(h);
}
```
- `lambda-fns/hotel/cancelHotel.ts` code.
```javascript
const { DynamoDB } = require("aws-sdk");
export {};

exports.handler = async function (event: any) {
  console.log("request:", JSON.stringify(event, undefined, 2));

  if (Math.random() < 0.4) {
    throw new Error("Internal Server Error");
  }

  let bookingID = "";
  if (typeof event.ReserveHotelResult !== "undefined") {
    bookingID = event.ReserveHotelResult.Payload.booking_id;
  }

  // create AWS SDK clients
  const dynamo = new DynamoDB();

  var params = {
    TableName: process.env.TABLE_NAME,
    Key: {
      pk: { S: event.trip_id },
      sk: { S: "HOTEL#" + bookingID },
    },
  };

  // Call DynamoDB to add the item to the table
  let result = await dynamo
    .deleteItem(params)
    .promise()
    .catch((error: any) => {
      throw new Error(error);
    });

  console.log("deleted hotel booking:");
  console.log(result);

  // return status of ok
  return { status: "ok" };
};

```

- `lambda-fns/flight/cancelFlight.ts` code.
```javascript
const { DynamoDB } = require("aws-sdk");
export {};

exports.handler = async function (event: any) {
  console.log("request:", JSON.stringify(event, undefined, 2));

  if (Math.random() < 0.4) {
    throw new Error("Internal Server Error");
  }

  let bookingID = "";
  if (typeof event.ReserveFlightResult !== "undefined") {
    bookingID = event.ReserveFlightResult.Payload.booking_id;
  }

  // create AWS SDK clients
  const dynamo = new DynamoDB();

  var params = {
    TableName: process.env.TABLE_NAME,
    Key: {
      pk: { S: event.trip_id },
      sk: { S: "FLIGHT#" + bookingID },
    },
  };

  // Call DynamoDB to add the item to the table
  let result = await dynamo
    .deleteItem(params)
    .promise()
    .catch((error: any) => {
      throw new Error(error);
    });

  console.log("deleted flight booking:");
  console.log(result);

  // return status of ok
  return { status: "ok" };
};

```

- `lambda-fns/payment/takePayment.ts` code.
```javascript
const { DynamoDB } = require("aws-sdk");
exports.handler = async function (event: any) {
  console.log("request:", JSON.stringify(event, undefined, 2));

  let flightBookingID = "";
  if (typeof event.ReserveFlightResult !== "undefined") {
    flightBookingID = event.ReserveFlightResult.Payload.booking_id;
  }

  let hotelBookingID = "";
  if (typeof event.ReserveHotelResult !== "undefined") {
    hotelBookingID = event.ReserveHotelResult.Payload.booking_id;
  }

  let paymentID = hashCode(
    "" + event.trip_id + hotelBookingID + flightBookingID
  );

  // If we passed the parameter to fail this step
  if (event.run_type === "failPayment") {
    throw new Error("Failed to book the flights");
  }

  // create AWS SDK clients
  const dynamo = new DynamoDB();

  var params = {
    TableName: process.env.TABLE_NAME,
    Item: {
      pk: { S: event.trip_id },
      sk: { S: "PAYMENT#" + paymentID },
      type: { S: "Payment" },
      trip_id: { S: event.trip_id },
      id: { S: paymentID },
      amount: { S: "450.00" },
      currency: { S: "USD" },
      transaction_status: { S: "confirmed" },
    },
  };

  // Call DynamoDB to add the item to the table
  let result = await dynamo
    .putItem(params)
    .promise()
    .catch((error: any) => {
      throw new Error(error);
    });

  console.log("Payment Taken Successfully:");
  console.log(result);

  // return status of ok
  return {
    status: "ok",
    payment_id: paymentID,
  };
};

function hashCode(s: string) {
  let h: any;

  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }

  return "" + Math.abs(h);
}


```


- `lambda-fns/payment/refundPayment.ts` code.
```javascript
const { DynamoDB } = require("aws-sdk");
export {};

exports.handler = async function (event: any) {
  console.log("request:", JSON.stringify(event, undefined, 2));

  if (Math.random() < 0.4) {
    throw new Error("Internal Server Error");
  }

  let paymentID = "";
  if (typeof event.TakePaymentResult !== "undefined") {
    paymentID = event.TakePaymentResult.Payload.payment_id;
  }

  // create AWS SDK clients
  const dynamo = new DynamoDB();

  var params = {
    TableName: process.env.TABLE_NAME,
    Key: {
      pk: { S: event.trip_id },
      sk: { S: "PAYMENT#" + paymentID },
    },
  };

  // Call DynamoDB to add the item to the table
  let result = await dynamo
    .deleteItem(params)
    .promise()
    .catch((error: any) => {
      throw new Error(error);
    });

  console.log("Payment has been refunded:");
  console.log(result);

  // return status of ok
  return {
    status: "ok",
  };
};

```

- `lambda-fns/hotel/confirmHotel .ts` code.
```javascript
const { DynamoDB } = require("aws-sdk");
export {};

exports.handler = async function (event: any) {
  console.log("request:", JSON.stringify(event, undefined, 2));

  let bookingID = "";

  // If we passed the parameter to fail this step
  if (event.run_type === "failHotelConfirmation") {
    throw new Error("Failed to confirm the hotel booking");
  }

  if (typeof event.ReserveHotelResult !== "undefined") {
    bookingID = event.ReserveHotelResult.Payload.booking_id;
  }

  // create AWS SDK clients
  const dynamo = new DynamoDB();

  var params = {
    TableName: process.env.TABLE_NAME,
    Key: {
      pk: { S: event.trip_id },
      sk: { S: "HOTEL#" + bookingID },
    },
    UpdateExpression: "set transaction_status = :booked",
    ExpressionAttributeValues: {
      ":booked": { S: "confirmed" },
    },
  };

  // Call DynamoDB to add the item to the table
  let result = await dynamo
    .updateItem(params)
    .promise()
    .catch((error: any) => {
      throw new Error(error);
    });

  console.log("updated hotel booking:");
  console.log(result);

  // return status of ok
  return {
    status: "ok",
    booking_id: bookingID,
  };
};

```

- `lambda-fns/flight/confirmFlight.ts` code.
```javascript
const { DynamoDB } = require("aws-sdk");
export {};

exports.handler = async function (event: any) {
  console.log("request:", JSON.stringify(event, undefined, 2));

  // If we passed the parameter to fail this step
  if (event.run_type === "failFlightsConfirmation") {
    throw new Error("Failed to book the flights");
  }

  let bookingID = "";
  if (typeof event.ReserveFlightResult !== "undefined") {
    bookingID = event.ReserveFlightResult.Payload.booking_id;
  }

  // create AWS SDK clients
  const dynamo = new DynamoDB();

  var params = {
    TableName: process.env.TABLE_NAME,
    Key: {
      pk: { S: event.trip_id },
      sk: { S: "FLIGHT#" + bookingID },
    },
    UpdateExpression: "set transaction_status = :booked",
    ExpressionAttributeValues: {
      ":booked": { S: "confirmed" },
    },
  };

  // Call DynamoDB to add the item to the table
  let result = await dynamo
    .updateItem(params)
    .promise()
    .catch((error: any) => {
      throw new Error(error);
    });

  console.log("confirmed flight booking:");
  console.log(result);

  // return status of ok
  return {
    status: "ok",
    booking_id: bookingID,
  };
};
```
- `lambda-fns/sagaLambda.ts`code. In this Step function will start execution.
```javascript
const AWS = require("aws-sdk");

const stepFunctions = new AWS.StepFunctions({
  region: "us-east-2",
});

module.exports.handler = (event: any, context: any, callback: any) => {
  // [success, failFlights, failHotel, failRental]
  let runType = "success";
  let tripID = "5c12d94a-ee6a-40d9-889b-1d49142248b7";

  if (null != event.queryStringParameters) {
    if (typeof event.queryStringParameters.runType != "undefined") {
      runType = event.queryStringParameters.runType;
    }

    if (typeof event.queryStringParameters.tripID != "undefined") {
      tripID = event.queryStringParameters.tripID;
    }
  }

  let input = {
    trip_id: tripID,
    depart: "London",
    depart_at: "2021-07-10T06:00:00.000Z",
    arrive: "Dublin",
    arrive_at: "2021-07-12T08:00:00.000Z",
    hotel: "holiday inn",
    check_in: "2021-07-10T12:00:00.000Z",
    check_out: "2021-07-12T14:00:00.000Z",
    rental: "Volvo",
    rental_from: "2021-07-10T00:00:00.000Z",
    rental_to: "2021-07-12T00:00:00.000Z",
    run_type: runType,
  };

  const params = {
    stateMachineArn: process.env.statemachine_arn,
    input: JSON.stringify(input),
  };

  stepFunctions.startExecution(params, (err: any, data: any) => {
    if (err) {
      console.log(err);
      const response = {
        statusCode: 500,
        body: JSON.stringify({
          message: "There was an error",
        }),
      };
      callback(null, response);
    } else {
      console.log(data);
      const response = {
        statusCode: 200,
        body: JSON.stringify({
          message: "The holiday booking system is processing your order",
        }),
      };
      callback(null, response);
    }
  });
};

```
#### Step 5 
Let's deploy it
```
npm run build && cdk deploy
```
### How to test pattern
After deployment you should have an API Gateway where any url you hit triggers the step function to start.

You can manipulate the flow of the step function with a couple of url parameters:

```
Successful Execution - https://{api gateway url}
Reserve Hotel Fail - https://{api gateway url}?runType=failHotelReservation
Confirm Hotel Fail - https://{api gateway url}?runType=failHotelConfirmation
Reserve Flight Fail - https://{api gateway url}?runType=failFlightsReservation
Confirm Flight Fail - https://{api gateway url}?runType=failFlightsConfirmation
Take Payment Fail - https://{api gateway url}?runType=failPayment
```
Inserting Muliple trips into DynamoDB, by default it will use the same ID on every execution
https://{api gateway url}?tripID={whatever you want}

It is important to note that the Cancel Lambdas all have a random failure built in and retry logic up to a max of 3. So when you look at the execution of your stepfunction in the aws console if you see failures in the cancel lambdas this is intentional. The reason why is to teach you that the cancel logic should attempt to self recover in the event of an error. Given that they only retry 3 times it is still possible for the cancel process to fail 3 times and the step function to terminate early.

To actually view what happened you will need to log into the AWS console and navigate to the step functions section where you can see every execution of your saga step function. You can also look inside the DynamoDB table at the records inserted. If you are fast enough with refresh you can watch them go from pending to confirmed status.

## Useful commands

 * `npm run build`   compile typescript to js
 * `npm run watch`   watch for changes and compile
 * `npm run test`    perform the jest unit tests
 * `cdk deploy`      deploy this stack to your default AWS account/region
 * `cdk diff`        compare deployed stack with current state
 * `cdk synth`       emits the synthesized CloudFormation template
