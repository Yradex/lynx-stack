import { ElementTemplateOpcodes } from '../../../../../src/element-template/protocol/opcodes.js';
import { root } from '../../../../../src/element-template/index.js';
import { __page } from '../../../../../src/element-template/runtime/page/page.js';
import { applyElementTemplatePatches } from '../../../../../src/element-template/runtime/patch.js';
import { ElementTemplateRegistry } from '../../../../../src/element-template/runtime/template/registry.js';
import { registerTemplates } from '../../../test-utils/debug/registry.js';
import { serializeToJSX } from '../../../test-utils/debug/serializer.js';
import { setupPatchContext, teardownPatchContext } from '../_shared.js';

declare const renderPage: () => void;

export function run() {
  const context = setupPatchContext();
  try {
    const jsx = <view />;
    root.render(jsx);
    context.envManager.switchToMainThread();
    root.render(jsx);
    renderPage();

    registerTemplates([
      {
        templateId: '_et_test_detach',
        compiledTemplate: {
          tag: '_et_test_detach',
          attributes: {},
          children: [
            { tag: 'slot', attributes: { 'part-id': 0 } },
            { tag: 'slot', attributes: { 'part-id': 1 } },
          ],
        },
      },
    ]);

    applyElementTemplatePatches([0, 20, '_et_test_detach', []]);
    const page = __page as unknown as { children?: unknown[] };
    page.children ??= [];
    page.children.push(ElementTemplateRegistry.get(20)!);

    applyElementTemplatePatches([
      0,
      10,
      'raw-text',
      'A',
      0,
      11,
      'raw-text',
      'B',
    ]);

    applyElementTemplatePatches([
      20,
      [
        ElementTemplateOpcodes.insertBefore,
        0,
        null,
        10,
        ElementTemplateOpcodes.insertBefore,
        0,
        null,
        11,
      ],
    ]);

    const beforeMove = serializeToJSX(__page);

    applyElementTemplatePatches([
      20,
      [
        ElementTemplateOpcodes.insertBefore,
        1,
        null,
        10,
      ],
    ]);

    const afterMove = serializeToJSX(__page);

    return {
      files: {
        'before-jsx.txt': beforeMove,
        'after-jsx.txt': afterMove,
      },
    };
  } finally {
    teardownPatchContext(context);
  }
}
