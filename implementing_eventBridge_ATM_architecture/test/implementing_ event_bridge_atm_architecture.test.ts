import {
  expect as expectCDK,
  matchTemplate,
  MatchStyle,
} from "@aws-cdk/assert";
import * as cdk from "@aws-cdk/core";
import * as ImplementingEventBridgeAtmArchitecture from "../lib/implementing_event_bridge_atm_architecture-stack";

test("Empty Stack", () => {
  const app = new cdk.App();
  // WHEN
  const stack = new ImplementingEventBridgeAtmArchitecture.ImplementingEventBridgeAtmArchitectureStack(
    app,
    "MyTestStack"
  );
  // THEN
  expectCDK(stack).to(
    matchTemplate(
      {
        Resources: {},
      },
      MatchStyle.EXACT
    )
  );
});
