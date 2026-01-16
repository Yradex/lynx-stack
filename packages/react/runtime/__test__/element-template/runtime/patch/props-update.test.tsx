// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { describe, expect, it } from 'vitest';

import { root } from '../../../../src/element-template/index.js';
import { runElementTemplateUpdate } from '../../test-utils/updateRunner.js';

describe('ElementTemplate props updates', () => {
  it('updates child attributes when props change', () => {
    function Child({ label }: { label: string }) {
      return <view id={label} />;
    }

    function App({ label }: { label: string }) {
      return <Child label={label} />;
    }

    const result = runElementTemplateUpdate({
      render: () => <App label='before' />,
      update: () => {
        root.render(<App label='after' />);
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
              attributes: expect.objectContaining({ id: 'after' }),
            }),
          ]),
        }),
      ]),
    );
  });
});
