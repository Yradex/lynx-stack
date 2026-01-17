import { hydrate as hydrateBackground } from '../../../../../src/element-template/background/hydrate.js';
import { __page } from '../../../../../src/element-template/runtime/page/page.js';
import { serializeToJSX } from '../../../test-utils/debug/serializer.js';
import { setupPatchContext, teardownPatchContext } from '../_shared.js';
import { root } from '../../../../../src/element-template/client/root.js';
import { __root } from '../../../../../src/element-template/runtime/page/root-instance.js';
import type { BackgroundElementTemplateInstance } from '../../../../../src/element-template/background/instance.js';

declare const renderPage: () => void;

export function run() {
  const context = setupPatchContext();
  try {
    function App() {
      const children = __BACKGROUND__
        ? [
          <view key='x' id='x' />,
          <view key='a' id='a' />,
          <view key='b' id='b' />,
        ]
        : [
          <view key='a' id='a' />,
          <view key='b' id='b' />,
        ];

      return <view>{children}</view>;
    }

    // 0. Render Background Thread State
    context.envManager.switchToBackground();
    root.render(<App />);

    // 1. Render Main Thread State
    context.envManager.switchToMainThread();
    root.render(<App />);
    renderPage();

    // 2. Render Background Thread State
    context.envManager.switchToBackground();
    const beforeData = context.hydrationData[0];

    const backgroundRoot = __root as unknown as { firstChild: BackgroundElementTemplateInstance | null };
    const afterData = backgroundRoot.firstChild;

    // 3. Diff
    const stream = hydrateBackground(beforeData!, afterData!);

    // 4. Apply Patch (on Main Thread)
    context.envManager.switchToMainThread();
    const afterJSX = serializeToJSX(__page);

    return {
      files: {
        'stream.txt': stream,
        'after-jsx.txt': afterJSX,
      },
    };
  } finally {
    teardownPatchContext(context);
  }
}
