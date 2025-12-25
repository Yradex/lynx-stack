// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __page } from '../../src/snapshot';
import { __root } from '../../src/root';
import { ElementTemplateRegistry } from '../../src/element-template/elementTemplateRegistry';
import { resetTemplateId } from '../../src/element-template/elementTemplateHandle';
import { installMockNativePapi, serializeToJSX } from './utils/mockNativePapi';

describe('renderPage with Element Template', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    installMockNativePapi();
    ElementTemplateRegistry.clear();
    resetTemplateId();
    (globalThis as any).__USE_ELEMENT_TEMPLATE__ = true;
  });

  it('should render node tree when calling renderPage', () => {
    function App() {
      return (
        <view id='main'>
          <text>Hello</text>
        </view>
      );
    }

    __root.__jsx = <App />;

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
  });
});
