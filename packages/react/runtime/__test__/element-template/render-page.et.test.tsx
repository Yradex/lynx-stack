// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { root } from '../../src/element-template/index.js';
import { __page } from '../../src/element-template/runtime/page/page.js';
import { ElementTemplateRegistry } from '../../src/element-template/runtime/template/registry.js';
import { resetTemplateId } from '../../src/element-template/runtime/template/handle.js';
import { installMockNativePapi, serializeToJSX } from './utils/mockNativePapi.js';

describe('renderPage with Element Template', () => {
  let mockContext: any;
  beforeEach(() => {
    vi.resetAllMocks();
    mockContext = installMockNativePapi();
    ElementTemplateRegistry.clear();
    resetTemplateId();
    (globalThis as any).__USE_ELEMENT_TEMPLATE__ = true;
  });

  afterEach(() => {
    delete (globalThis as any).__USE_ELEMENT_TEMPLATE__;
    mockContext.cleanup();
  });

  it('should render node tree when calling renderPage', () => {
    function App() {
      return (
        <view id='main'>
          <text>Hello</text>
        </view>
      );
    }

    root.render(<App />);

    // Call the global renderPage (injected by src/lynx/calledByNative.ts via src/lynx.ts)
    // @ts-ignore
    renderPage();

    // Verify the rendered tree
    const actualJSX = serializeToJSX(__page);
    expect(actualJSX).toMatchInlineSnapshot(`
      "<page>
        <view id=\"main\">
          <text text=\"Hello\" />
        </view>
      </page>"
    `);

    expect(mockContext.nativeLog).toMatchInlineSnapshot(`
      [
        [
          "__CreatePage",
          "0",
          0,
        ],
        [
          "__ElementFromBinary",
          "_et_a94a8_test_1",
          null,
          [],
          null,
        ],
        [
          "__AppendElement",
          "0",
          "<_et_a94a8_test_1 />",
        ],
      ]
    `);
  });
});
