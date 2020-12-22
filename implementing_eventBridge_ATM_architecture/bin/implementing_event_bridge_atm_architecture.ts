#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "@aws-cdk/core";
import { ImplementingEventBridgeAtmArchitectureStack } from "../lib/implementing_event_bridge_atm_architecture-stack";

const app = new cdk.App();
new ImplementingEventBridgeAtmArchitectureStack(
  app,
  "ImplementingEventBridgeAtmArchitectureStack"
);
