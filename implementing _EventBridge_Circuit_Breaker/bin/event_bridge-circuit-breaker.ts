#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { EventBridgeCircuitBreakerStack } from '../lib/event_bridge-circuit-breaker-stack';

const app = new cdk.App();
new EventBridgeCircuitBreakerStack(app, 'EventBridgeCircuitBreakerStack');
