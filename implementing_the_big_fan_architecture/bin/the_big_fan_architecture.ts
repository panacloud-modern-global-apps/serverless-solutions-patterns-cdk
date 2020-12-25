#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { TheBigFanArchitectureStack } from '../lib/the_big_fan_architecture-stack';

const app = new cdk.App();
new TheBigFanArchitectureStack(app, 'TheBigFanArchitectureStack');
