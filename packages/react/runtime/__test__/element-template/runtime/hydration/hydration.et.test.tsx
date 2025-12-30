// Copyright 2025 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { installMockNativePapi } from '../../test-utils/mockNativePapi.js';
import { root } from '../../../../src/element-template/index.js';
import { ElementTemplateLifecycleConstant } from '../../../../src/element-template/runtime/lifecycle-constant.js';
import { resetTemplateId } from '../../../../src/element-template/runtime/template/handle.js';
import { ElementTemplateRegistry } from '../../../../src/element-template/runtime/template/registry.js';

describe('Hydration Data Generation', () => {
  let hydrationData: any[] = [];
  let mockContext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = installMockNativePapi();
    ElementTemplateRegistry.clear();
    resetTemplateId();
    (globalThis as any).__USE_ELEMENT_TEMPLATE__ = true;
    hydrationData = [];

    // Mock __OnLifecycleEvent to capture hydration data
    const mockOnLifecycleEvent = vi.fn().mockImplementation((args) => {
      const [event, data] = args;
      if (event === ElementTemplateLifecycleConstant.hydrate) {
        hydrationData.push(...data);
      }
    });
    vi.stubGlobal('__OnLifecycleEvent', mockOnLifecycleEvent);
  });

  it('generates correct hydration tree for simple element', () => {
    const logo = 'logo.png';
    function App() {
      return (
        <view src={logo}>
          Hello
        </view>
      );
    }
    root.render(<App />);
    // @ts-ignore
    renderPage();

    expect(hydrationData).toMatchInlineSnapshot(`
      [
        [
          -1,
          "_et_a94a8_test_1",
          {},
          {
            "0": {
              "src": "logo.png",
            },
          },
        ],
      ]
    `);
  });

  it('generates correct hydration tree for nested instances', () => {
    function App() {
      return (
        <parent>
          <child />
        </parent>
      );
    }
    root.render(<App />);
    // @ts-ignore
    renderPage();

    expect(hydrationData).toMatchInlineSnapshot(`
      [
        [
          -1,
          "_et_a94a8_test_2",
          {},
          {},
        ],
      ]
    `);
  });

  it('generates correct hydration tree for texts', () => {
    const text = 'Hello';
    function App() {
      return (
        <parent>
          {text}
        </parent>
      );
    }
    root.render(<App />);
    // @ts-ignore
    renderPage();

    expect(hydrationData).toMatchInlineSnapshot(`
      [
        [
          -1,
          "_et_a94a8_test_3",
          {
            "0": [
              "Hello",
            ],
          },
          {},
        ],
      ]
    `);
  });

  it('accumulates multiple root instances (siblings)', () => {
    function App() {
      return (
        <>
          <item1 />
          <item2 />
        </>
      );
    }
    root.render(<App />);
    // @ts-ignore
    renderPage();

    expect(hydrationData).toMatchInlineSnapshot(`
      [
        [
          -1,
          "_et_a94a8_test_4",
          {},
          {},
        ],
        [
          -2,
          "_et_a94a8_test_5",
          {},
          {},
        ],
      ]
    `);
  });

  it('handles sub-components correctly', () => {
    function MyComp({ name }: { name: string }) {
      return (
        <view class='comp'>
          {name}
        </view>
      );
    }

    function App() {
      return (
        <view class='root'>
          <MyComp name='inner' />
        </view>
      );
    }

    root.render(<App />);
    // @ts-ignore
    renderPage();

    expect(hydrationData).toMatchInlineSnapshot(`
      [
        [
          -2,
          "_et_a94a8_test_7",
          {
            "0": [
              [
                -1,
                "_et_a94a8_test_6",
                {
                  "0": [
                    "inner",
                  ],
                },
                {},
              ],
            ],
          },
          {},
        ],
      ]
    `);
  });

  it('handles JSX map (dynamic lists) correctly', () => {
    function App() {
      const items = ['a', 'b', 'c'];
      return (
        <view>
          {items.map((item, index) => (
            <text key={item}>
              {item}
            </text>
          ))}
        </view>
      );
    }

    root.render(<App />);
    // @ts-ignore
    renderPage();

    expect(hydrationData).toMatchInlineSnapshot(`
      [
        [
          -4,
          "_et_a94a8_test_8",
          {
            "0": [
              [
                -1,
                "_et_a94a8_test_9",
                {
                  "0": [
                    "a",
                  ],
                },
                {},
              ],
              [
                -2,
                "_et_a94a8_test_9",
                {
                  "0": [
                    "b",
                  ],
                },
                {},
              ],
              [
                -3,
                "_et_a94a8_test_9",
                {
                  "0": [
                    "c",
                  ],
                },
                {},
              ],
            ],
          },
          {},
        ],
      ]
    `);
  });
});
