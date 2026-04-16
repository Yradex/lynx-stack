import type { RossiEtFixtureRequest, RossiEtObservedResult } from './fixtureContract.js';
import type { RossiEtLocalBridge } from './localRossiBridge.js';

/**
 * Keep the ET-side shim focused on fixture-local concerns. This helper may
 * package compiled input together with execution assembly hints, but Rossi must
 * remain the owner of actual runtime lifecycle driving.
 */
export async function runRossiFixture(
  options: {
    request: RossiEtFixtureRequest;
    bridge: RossiEtLocalBridge;
  },
): Promise<RossiEtObservedResult> {
  return options.bridge.runCompiledFixture(options.request);
}
