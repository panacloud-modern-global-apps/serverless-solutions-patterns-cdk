import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as Aws00HelloConstructs from '../lib/aws00_hello_constructs-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new Aws00HelloConstructs.Aws00HelloConstructsStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
