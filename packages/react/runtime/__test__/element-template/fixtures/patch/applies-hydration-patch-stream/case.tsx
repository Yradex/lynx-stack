import { hydrate as hydrateBackground } from '../../../../../src/element-template/background/hydrate.js';
import type { BackgroundElementTemplateInstance } from '../../../../../src/element-template/background/instance.js';
import { root } from '../../../../../src/element-template/client/root.js';
import { __page } from '../../../../../src/element-template/runtime/page/page.js';
import { __root } from '../../../../../src/element-template/runtime/page/root-instance.js';
import { serializeToJSX } from '../../../test-utils/debug/serializer.js';
import { setupPatchContext, teardownPatchContext } from '../_shared.js';

declare const renderPage: () => void;

export function run() {
  const context = setupPatchContext();
  try {
    function App() {
      const label = __BACKGROUND__ ? 'bg' : 'main';
      const A = <view key='a' id='a' />;
      const B = <view key='b' id='b' />;
      const T = <text key='t'>{__BACKGROUND__ ? 'BG' : 'Main'}</text>;
      const I = <image key='i' />;
      const children = __BACKGROUND__ ? [B, T, A, I] : [A, T, B];
      return <view id={label}>{children}</view>;
    }

    // 0. Render Background Thread State
    context.envManager.switchToBackground();
    root.render(<App />);

    // 1. Render Main Thread State
    context.envManager.switchToMainThread();
    root.render(<App />);
    renderPage();
    const beforeJSX = serializeToJSX(__page);

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
        'before-jsx.txt': beforeJSX,
        'after-jsx.txt': afterJSX,
      },
    };
  } finally {
    teardownPatchContext(context);
  }
}
