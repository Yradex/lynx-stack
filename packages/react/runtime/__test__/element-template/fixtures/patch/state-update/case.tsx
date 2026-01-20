import { useState } from '@lynx-js/react';
import { options } from 'preact';

import { resetGlobalCommitContext } from '../../../../../src/element-template/background/commit-context.js';
import { root } from '../../../../../src/element-template/index.js';
import { __page } from '../../../../../src/element-template/runtime/page/page.js';
import { __root } from '../../../../../src/element-template/runtime/page/root-instance.js';
import { serializeToJSX } from '../../../test-utils/debug/serializer.js';
import { formatPatchStream } from '../../../test-utils/debug/updateRunner.js';
import { setupUpdateFixtureContext, teardownUpdateFixtureContext } from '../_shared.js';

declare const renderPage: () => void;

export async function run() {
  const context = setupUpdateFixtureContext();
  const { envManager, hydrationData, updateEvents } = context;

  // Capture scheduled renders so we can flush them while still on background thread.
  const scheduledRenders: Array<() => void> = [];
  const previousDebounce = options.debounceRendering;
  options.debounceRendering = (cb) => {
    scheduledRenders.push(cb);
  };

  try {
    let triggerUpdate: (() => void) | undefined;

    function App() {
      const [label, setLabel] = useState('before');

      if (__BACKGROUND__) {
        triggerUpdate = () => setLabel('after');
      }

      return <view attrs={{ 0: { id: label } }} />;
    }

    envManager.switchToMainThread(() => {
      root.render(<App />);
      renderPage();
    });
    const beforePageJsx = serializeToJSX(__page);

    envManager.switchToBackground(() => {
      root.render(<App />);
    });

    if (hydrationData.length === 0) {
      throw new Error('Missing hydration payload.');
    }

    updateEvents.length = 0;
    envManager.switchToBackground(() => {
      resetGlobalCommitContext();
      triggerUpdate!();
      while (scheduledRenders.length > 0) {
        const flush = scheduledRenders.shift();
        flush?.();
      }
    });

    envManager.switchToMainThread();
    const afterPageJsx = serializeToJSX(__page);
    const updatePayload = updateEvents[updateEvents.length - 1];
    const eventPatches = updatePayload?.patches ?? [];

    return {
      files: {
        'before-jsx.txt': beforePageJsx,
        'after-jsx.txt': afterPageJsx,
        'patches.txt': formatPatchStream(eventPatches),
      },
    };
  } finally {
    options.debounceRendering = previousDebounce;
    (__root as { __jsx?: unknown }).__jsx = undefined;
    teardownUpdateFixtureContext(context);
  }
}
