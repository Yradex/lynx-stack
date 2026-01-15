import { hydrate as hydrateBackground } from '../../../../../src/element-template/background/hydrate.js';
import { __page } from '../../../../../src/element-template/runtime/page/page.js';
import { applyElementTemplatePatches } from '../../../../../src/element-template/runtime/patch.js';
import { serializeToJSX } from '../../../test-utils/serializer.js';
import { renderAndCollect, setupPatchContext, teardownPatchContext } from '../_shared.js';

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

    const { before, after } = renderAndCollect(App, context);
    const stream = hydrateBackground(before, after);

    context.envManager.switchToMainThread();
    const beforeJSX = serializeToJSX(__page);
    applyElementTemplatePatches(stream);
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
