#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { ImplementingTheDynamoStreamerArchitectureStack } from '../lib/implementing_the_dynamo_streamer_architecture-stack';

const app = new cdk.App();
new ImplementingTheDynamoStreamerArchitectureStack(app, 'ImplementingTheDynamoStreamerArchitectureStack');
