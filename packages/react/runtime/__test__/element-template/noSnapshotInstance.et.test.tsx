// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __root } from '../../src/root';
import { ElementTemplateRegistry } from '../../src/element-template/elementTemplateRegistry';
import { resetTemplateId } from '../../src/element-template/elementTemplateHandle';
import * as internal from '../../src/internal';
import { installMockNativePapi } from './utils/mockNativePapi';

describe('Element Template renderPage does not create SnapshotInstance', () => {
  let snapshotCtorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetAllMocks();
    installMockNativePapi();
    ElementTemplateRegistry.clear();
    resetTemplateId();
    (globalThis as any).__USE_ELEMENT_TEMPLATE__ = true;
    snapshotCtorSpy = vi.spyOn(internal, 'SnapshotInstance');
  });

  it('should not construct SnapshotInstance during renderPage', () => {
    function App() {
      return (
        <view id='main'>
          <text>Hello</text>
        </view>
      );
    }

    __root.__jsx = <App />;

    snapshotCtorSpy.mockClear();
    // @ts-ignore
    renderPage();

    expect(snapshotCtorSpy).not.toHaveBeenCalled();
  });
});
