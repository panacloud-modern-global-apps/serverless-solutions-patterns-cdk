import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as EventBridgeCircuitBreaker from '../lib/event_bridge-circuit-breaker-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new EventBridgeCircuitBreaker.EventBridgeCircuitBreakerStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
