import { hydrate as hydrateBackground } from '../../../../../src/element-template/background/hydrate.js';
import { __page } from '../../../../../src/element-template/runtime/page/page.js';
import { applyElementTemplatePatches } from '../../../../../src/element-template/runtime/patch.js';
import { serializeToJSX } from '../../../test-utils/debug/serializer.js';
import { renderAndCollect, setupPatchContext, teardownPatchContext } from '../_shared.js';

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

    const { before, after } = renderAndCollect(App, context);
    const stream = hydrateBackground(before, after);

    context.envManager.switchToMainThread();
    applyElementTemplatePatches(stream);
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
