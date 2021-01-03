import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as ImplementTheScalableWebhookArchitecture from '../lib/implement_the_scalable_webhook_architecture-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new ImplementTheScalableWebhookArchitecture.ImplementTheScalableWebhookArchitectureStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
