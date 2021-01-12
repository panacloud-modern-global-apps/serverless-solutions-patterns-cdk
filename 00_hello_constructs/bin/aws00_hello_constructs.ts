#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { Aws00HelloConstructsStack } from '../lib/aws00_hello_constructs-stack';

const app = new cdk.App();
new Aws00HelloConstructsStack(app, 'Aws00HelloConstructsStack');
