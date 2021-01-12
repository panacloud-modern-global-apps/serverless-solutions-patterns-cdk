module.exports.params = {
  Entries: [
    {
      // Event envelope fields
      Source: "myATMapp",
      EventBusName: "AtmEventBus",
      DetailType: "transaction",
      Time: new Date(),

      // Main event body
      Detail: JSON.stringify({
        action: "withdrawal",
        location: "MA-BOS-01",
        amount: 300,
        result: "approved",
        transactionId: "123456",
        cardPresent: true,
        partnerBank: "Example Bank",
        remainingFunds: 722.34,
      }),
    },
    {
      // Event envelope fields
      Source: "myATMapp",
      EventBusName: "AtmEventBus",
      DetailType: "transaction",
      Time: new Date(),

      // Main event body
      Detail: JSON.stringify({
        action: "withdrawal",
        location: "NY-NYC-001",
        amount: 20,
        result: "approved",
        transactionId: "123457",
        cardPresent: true,
        partnerBank: "Example Bank",
        remainingFunds: 212.52,
      }),
    },
    {
      // Event envelope fields
      Source: "myATMapp",
      EventBusName: "AtmEventBus",
      DetailType: "transaction",
      Time: new Date(),

      // Main event body
      Detail: JSON.stringify({
        action: "withdrawal",
        location: "NY-NYC-002",
        amount: 60,
        result: "denied",
        transactionId: "123458",
        cardPresent: true,
        remainingFunds: 5.77,
      }),
    },
  ],
};
