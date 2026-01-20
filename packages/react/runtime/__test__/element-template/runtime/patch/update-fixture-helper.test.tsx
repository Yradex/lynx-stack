import { describe, expect, it } from 'vitest';

import { resetGlobalCommitContext } from '../../../../src/element-template/background/commit-context.js';
import { root } from '../../../../src/element-template/index.js';
import { __page } from '../../../../src/element-template/runtime/page/page.js';
import { serializeToJSX } from '../../test-utils/debug/serializer.js';
import { formatPatchStream } from '../../test-utils/debug/updateRunner.js';
import { setupUpdateFixtureContext, teardownUpdateFixtureContext } from '../../fixtures/patch/_shared.js';

declare const renderPage: () => void;

describe('patch update fixture helper', () => {
  it('collects patches for a props update', () => {
    const context = setupUpdateFixtureContext();

    try {
      function App({ label }: { label: string }) {
        return <view attrs={{ 0: { id: label } }} />;
      }

      context.envManager.switchToMainThread(() => {
        root.render(<App label='before' />);
        renderPage();
      });

      context.envManager.switchToBackground(() => {
        root.render(<App label='before' />);
      });

      if (context.hydrationData.length === 0) {
        throw new Error('Missing hydration payload.');
      }

      context.updateEvents.length = 0;
      context.envManager.switchToBackground(() => {
        resetGlobalCommitContext();
        root.render(<App label='after' />);
      });

      context.envManager.switchToMainThread();
      const updatePayload = context.updateEvents[context.updateEvents.length - 1];
      const patches = updatePayload?.patches ?? [];
      expect(formatPatchStream(patches).length).toBeGreaterThan(0);
      expect(serializeToJSX(__page)).toContain('after');
    } finally {
      teardownUpdateFixtureContext(context);
    }
  });
});
