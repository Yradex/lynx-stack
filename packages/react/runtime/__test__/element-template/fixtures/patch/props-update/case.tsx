import { resetGlobalCommitContext } from '../../../../../src/element-template/background/commit-context.js';
import { root } from '../../../../../src/element-template/index.js';
import { __page } from '../../../../../src/element-template/runtime/page/page.js';
import { serializeToJSX } from '../../../test-utils/debug/serializer.js';
import { formatPatchStream } from '../../../test-utils/debug/updateRunner.js';
import { setupUpdateFixtureContext, teardownUpdateFixtureContext } from '../_shared.js';

declare const renderPage: () => void;

export function run() {
  const context = setupUpdateFixtureContext();
  const { envManager, hydrationData, updateEvents } = context;

  try {
    function Child({ label }: { label: string }) {
      return <view attrs={{ 0: { id: label } }} />;
    }

    function App({ label }: { label: string }) {
      return <Child label={label} />;
    }

    envManager.switchToBackground(() => {
      root.render(<App label='before' />);
    });
    envManager.switchToMainThread(() => {
      root.render(<App label='before' />);
      renderPage();
    });
    const beforePageJsx = serializeToJSX(__page);
    envManager.switchToBackground();

    if (hydrationData.length === 0) {
      throw new Error('Missing hydration payload.');
    }

    updateEvents.length = 0;
    envManager.switchToBackground(() => {
      resetGlobalCommitContext();
      root.render(<App label='after' />);
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
    teardownUpdateFixtureContext(context);
  }
}
