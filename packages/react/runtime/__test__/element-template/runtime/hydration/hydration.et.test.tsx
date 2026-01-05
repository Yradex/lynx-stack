// Copyright 2025 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { root } from '../../../../src/element-template/index.js';
import { ElementTemplateLifecycleConstant } from '../../../../src/element-template/runtime/lifecycle-constant.js';
import { resetTemplateId } from '../../../../src/element-template/runtime/template/handle.js';
import { ElementTemplateRegistry } from '../../../../src/element-template/runtime/template/registry.js';
import { installMockNativePapi } from '../../test-utils/mockNativePapi.js';

declare const renderPage: () => void;

describe('Hydration Data Generation', () => {
  let hydrationData: any[] = [];
  let mockContext: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContext = installMockNativePapi();
    ElementTemplateRegistry.clear();
    resetTemplateId();
    (globalThis as unknown as { __USE_ELEMENT_TEMPLATE__: boolean }).__USE_ELEMENT_TEMPLATE__ = true;
    hydrationData = [];

    // Mock __OnLifecycleEvent to capture hydration data
    const mockOnLifecycleEvent = vi.fn().mockImplementation((args: unknown[]) => {
      const [event, data] = args as [unknown, unknown];
      if (event === ElementTemplateLifecycleConstant.hydrate && Array.isArray(data)) {
        for (const item of data) {
          hydrationData.push(item);
        }
      }
    });
    vi.stubGlobal('__OnLifecycleEvent', mockOnLifecycleEvent);
  });

  it('generates correct hydration tree for simple element', () => {
    const logo = 'logo.png';
    function App() {
      return (
        <view id={logo}>
          Hello
        </view>
      );
    }
    root.render(<App />);
    renderPage();

    expect(hydrationData).toMatchInlineSnapshot(`
      [
        [
          -1,
          "_et_a94a8_test_1",
          {},
          {
            "0": {
              "id": "logo.png",
            },
          },
        ],
      ]
    `);
  });

  it('generates correct hydration tree for nested instances', () => {
    function App() {
      return (
        <view>
          <view />
        </view>
      );
    }
    root.render(<App />);
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
        <view>
          {text}
        </view>
      );
    }
    root.render(<App />);
    renderPage();

    expect(hydrationData).toMatchInlineSnapshot(`
      [
        [
          -2,
          "_et_a94a8_test_3",
          {
            "0": [
              [
                -1,
                "raw-text",
                {},
                {
                  "0": {
                    "text": "Hello",
                  },
                },
              ],
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
          <view />
          <view />
        </>
      );
    }
    root.render(<App />);
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
    renderPage();

    expect(hydrationData).toMatchInlineSnapshot(`
      [
        [
          -3,
          "_et_a94a8_test_7",
          {
            "0": [
              [
                -2,
                "_et_a94a8_test_6",
                {
                  "0": [
                    [
                      -1,
                      "raw-text",
                      {},
                      {
                        "0": {
                          "text": "inner",
                        },
                      },
                    ],
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
          {items.map((item) => (
            <text key={item}>
              {item}
            </text>
          ))}
        </view>
      );
    }

    root.render(<App />);
    renderPage();

    expect(hydrationData).toMatchInlineSnapshot(`
      [
        [
          -7,
          "_et_a94a8_test_8",
          {
            "0": [
              [
                -2,
                "_et_a94a8_test_9",
                {
                  "0": [
                    [
                      -1,
                      "raw-text",
                      {},
                      {
                        "0": {
                          "text": "a",
                        },
                      },
                    ],
                  ],
                },
                {},
              ],
              [
                -4,
                "_et_a94a8_test_9",
                {
                  "0": [
                    [
                      -3,
                      "raw-text",
                      {},
                      {
                        "0": {
                          "text": "b",
                        },
                      },
                    ],
                  ],
                },
                {},
              ],
              [
                -6,
                "_et_a94a8_test_9",
                {
                  "0": [
                    [
                      -5,
                      "raw-text",
                      {},
                      {
                        "0": {
                          "text": "c",
                        },
                      },
                    ],
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
