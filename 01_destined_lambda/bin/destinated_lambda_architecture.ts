#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { DestinatedLambdaArchitectureStack } from '../lib/destinated_lambda_architecture-stack';

const app = new cdk.App();
new DestinatedLambdaArchitectureStack(app, 'DestinatedLambdaArchitectureStack');
