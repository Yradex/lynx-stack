// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { options } from 'preact';

import {
  __OpAttr,
  __OpBegin,
  __OpEnd,
  __OpSlotBegin,
  __OpSlotEnd,
  __OpText,
  renderToString,
} from '../../src/renderToOpcodes/index';

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
    expect(__OpSlotBegin).toBe(4);
    expect(__OpSlotEnd).toBe(5);
  });

  it('should render Slot opcodes when __USE_ELEMENT_TEMPLATE__ is true', () => {
    globalThis.__USE_ELEMENT_TEMPLATE__ = true;

    const child = <text>hello</text>;
    const vnode = (
      <view>
        {child}
      </view>
    );

    const opcodes = renderToString(vnode);

    expect(opcodes).toEqual([
      __OpBegin,
      vnode,
      __OpSlotBegin,
      0,
      __OpBegin,
      child,
      __OpEnd,
      __OpSlotEnd,
      __OpEnd,
    ]);
  });

  it('should handle nested Slots', () => {
    globalThis.__USE_ELEMENT_TEMPLATE__ = true;

    const innerChild = <text>nested</text>;
    const inner = <view>{innerChild}</view>;
    const vnode = (
      <view>
        {inner}
      </view>
    );

    const opcodes = renderToString(vnode);

    expect(opcodes).toEqual([
      __OpBegin,
      vnode,
      __OpSlotBegin,
      0,
      __OpBegin,
      inner,
      __OpSlotBegin,
      0,
      __OpBegin,
      innerChild,
      __OpEnd,
      __OpSlotEnd,
      __OpEnd,
      __OpSlotEnd,
      __OpEnd,
    ]);
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

  it('should render multiple children inside Slot in order', () => {
    globalThis.__USE_ELEMENT_TEMPLATE__ = true;

    const items = ['a', 'b'];
    const vnode = (
      <view>
        {items}
      </view>
    );

    const opcodes = renderToString(vnode);

    expect(opcodes).toEqual([
      __OpBegin,
      vnode,
      __OpSlotBegin,
      0,
      __OpText,
      'a',
      __OpText,
      'b',
      __OpSlotEnd,
      __OpEnd,
    ]);
  });

  it('should render custom component wrapped in Slot', () => {
    globalThis.__USE_ELEMENT_TEMPLATE__ = true;

    function CustomComponent({ children }) {
      return (
        <view>
          <text>custom</text>
          {children}
        </view>
      );
    }

    const child = <text>child</text>;
    // The structure simulates:
    // <view>
    //   <Slot id={0}>
    //     <CustomComponent>
    //       {child} (which might be another template if static, but here passed as children)
    //     </CustomComponent>
    //   </Slot>
    // </view>
    const vnode = (
      <view>
        <CustomComponent>
          {child}
        </CustomComponent>
      </view>
    );

    const opcodes = renderToString(vnode);

    // Expected structure:
    // 1. Outer view (Begin) -> _et_outer (template)
    // 2. Slot (SlotBegin) - because CustomComponent is a dynamic component boundary
    // 3. CustomComponent execution -> returns _et_inner (template)
    //    Note: The internal <view><text>custom</text>{children}</view> is compiled into a template!
    //    So we won't see individual opcodes for 'view' or 'custom' text.
    //    We will see:
    //    3.1 _et_inner (Begin)
    //    3.2 Slot inside _et_inner (SlotBegin)
    //    3.3 children "child" (passed from outside)
    //        Note: "child" (<text>child</text>) is ALSO static, so it's compiled into a template.
    //        It will only emit Begin/End, no __OpText!
    //    3.4 Slot (SlotEnd)
    //    3.5 _et_inner (End)
    // 4. Slot (SlotEnd)
    // 5. Outer view (End)

    expect(opcodes).toEqual([
      __OpBegin,
      vnode,
      __OpSlotBegin,
      0,
      // CustomComponent rendered content (which is also a template):
      __OpBegin,
      expect.objectContaining({ type: expect.stringMatching(/_et_/) }), // CustomComponent root template
      __OpSlotBegin,
      0, // The slot inside CustomComponent
      __OpBegin,
      child, // passed child (static template)
      __OpEnd,
      __OpSlotEnd,
      __OpEnd,
      __OpSlotEnd,
      __OpEnd,
    ]);
  });

  it('should render attrs and Slot opcodes properly', () => {
    globalThis.__USE_ELEMENT_TEMPLATE__ = true;

    const test = 'test';
    const hello = 'Hello';

    const vnode = (
      <view id={test}>
        {hello}
      </view>
    );

    const opcodes = renderToString(vnode);

    expect(opcodes).toEqual([
      __OpBegin,
      vnode,
      __OpAttr,
      'attrs',
      { 0: { id: 'test' } },
      __OpSlotBegin,
      1,
      __OpText,
      'Hello',
      __OpSlotEnd,
      __OpEnd,
    ]);
  });
});
