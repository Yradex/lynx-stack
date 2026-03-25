// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
import { options } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __OpAttr,
  __OpBegin,
  __OpEnd,
  __OpSlot,
  __OpText,
  renderToString,
} from '../../../../src/element-template/runtime/render/render-to-opcodes';

describe('Element Template renderToOpcodes', () => {
  let originalUseElementTemplate;
  let originalUnmount;

  beforeEach(() => {
    originalUseElementTemplate = globalThis.__USE_ELEMENT_TEMPLATE__;
    originalUnmount = options.unmount;
  });

  afterEach(() => {
    globalThis.__USE_ELEMENT_TEMPLATE__ = originalUseElementTemplate;
    options.unmount = originalUnmount;
  });

  it('should export correct opcodes', () => {
    expect(__OpBegin).toBe(0);
    expect(__OpEnd).toBe(1);
    expect(__OpAttr).toBe(2);
    expect(__OpText).toBe(3);
    expect(__OpSlot).toBe(4);
  });

  it('should call unmount hook for Slot in element template mode', () => {
    globalThis.__USE_ELEMENT_TEMPLATE__ = true;
    options.unmount = vi.fn();

    const child = <text>hook</text>;
    const vnode = (
      <view>
        {child}
      </view>
    );

    renderToString(vnode);

    expect(options.unmount).toHaveBeenCalled();
  });
});
