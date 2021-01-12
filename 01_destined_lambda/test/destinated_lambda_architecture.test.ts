import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as DestinatedLambdaArchitecture from '../lib/destinated_lambda_architecture-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new DestinatedLambdaArchitecture.DestinatedLambdaArchitectureStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
