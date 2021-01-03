#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { ImplementTheScalableWebhookArchitectureStack } from '../lib/implement_the_scalable_webhook_architecture-stack';

const app = new cdk.App();
new ImplementTheScalableWebhookArchitectureStack(app, 'ImplementTheScalableWebhookArchitectureStack');
