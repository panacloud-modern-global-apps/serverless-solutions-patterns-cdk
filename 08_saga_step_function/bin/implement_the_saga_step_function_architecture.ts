#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { ImplementTheSagaStepFunctionArchitectureStack } from '../lib/implement_the_saga_step_function_architecture-stack';

const app = new cdk.App();
new ImplementTheSagaStepFunctionArchitectureStack(app, 'ImplementTheSagaStepFunctionArchitectureStack');
