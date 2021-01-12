#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { ImplementTheEventBridgeEtlArchitectureStack } from '../lib/implement_the_event_bridge_etl_architecture-stack';

const app = new cdk.App();
new ImplementTheEventBridgeEtlArchitectureStack(app, 'ImplementTheEventBridgeEtlArchitectureStack');
