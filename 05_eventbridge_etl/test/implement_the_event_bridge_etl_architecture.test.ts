import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as ImplementTheEventBridgeEtlArchitecture from '../lib/implement_the_event_bridge_etl_architecture-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new ImplementTheEventBridgeEtlArchitecture.ImplementTheEventBridgeEtlArchitectureStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});
