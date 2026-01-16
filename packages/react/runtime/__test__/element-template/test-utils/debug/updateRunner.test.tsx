import { describe, expect, it } from 'vitest';

import { root } from '../../../../src/element-template/index.js';
import { ElementTemplateOpcodes } from '../../../../src/element-template/protocol/opcodes.js';
import type { ElementTemplatePatchStream } from '../../../../src/element-template/protocol/types.js';
import { formatPatchStream, runElementTemplateUpdate } from './updateRunner.js';

describe('element-template update runner', () => {
  it('formats patch stream entries', () => {
    const stream: ElementTemplatePatchStream = [
      0,
      1,
      'raw-text',
      'hello',
      2,
      [ElementTemplateOpcodes.setAttributes, 3, { id: 'next' }],
    ];

    expect(formatPatchStream(stream)).toEqual([
      {
        type: 'create',
        id: 1,
        template: 'raw-text',
        init: 'hello',
      },
      {
        type: 'patch',
        id: 2,
        opcodes: [
          {
            type: 'setAttributes',
            id: 3,
            attributes: { id: 'next' },
          },
        ],
      },
    ]);
  });

  it('collects update output and patches', () => {
    let label = 'before';

    function App() {
      return <view id={label} />;
    }

    const result = runElementTemplateUpdate({
      render: () => <App />,
      update: () => {
        label = 'after';
        root.render(<App />);
      },
    });

    expect(result.beforePageJsx).toContain('id="before"');
    expect(result.afterPageJsx).toContain('id="after"');
    expect(result.formattedPatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'patch',
          opcodes: expect.arrayContaining([
            expect.objectContaining({
              type: 'setAttributes',
              attributes: { id: 'after' },
            }),
          ]),
        }),
      ]),
    );
  });
});
