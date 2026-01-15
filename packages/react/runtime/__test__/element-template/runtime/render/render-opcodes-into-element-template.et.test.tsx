// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderOpcodesIntoElementTemplate } from '../../../../src/element-template/runtime/render/render-opcodes.js';
import { __OpEnd } from '../../../../src/renderToOpcodes/index.js';

describe('renderOpcodesIntoElementTemplate', () => {
  let root: { type: 'root' };

  beforeEach(() => {
    root = { type: 'root' };
  });

  it('throws when popping the root frame', () => {
    expect(() => renderOpcodesIntoElementTemplate([__OpEnd], root)).toThrow(
      'Popped root frame',
    );
  });

  it('throws when the stack underflows', () => {
    const originalPop = Array.prototype.pop;
    let hasReturnedUndefined = false;
    const popSpy = vi.spyOn(Array.prototype, 'pop').mockImplementation(function() {
      if (!hasReturnedUndefined) {
        hasReturnedUndefined = true;
        return undefined;
      }
      return originalPop.apply(this);
    });

    expect(() => renderOpcodesIntoElementTemplate([__OpEnd], root)).toThrow(
      'Stack underflow',
    );

    popSpy.mockRestore();
  });

  it('throws on unknown opcodes', () => {
    expect(() => renderOpcodesIntoElementTemplate([999], root)).toThrow(
      'Unknown opcode: 999',
    );
  });
});
