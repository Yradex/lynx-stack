// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { describe, expect, it, vi, afterEach } from 'vitest';
import { Slot } from '../../../../src/element-template/internal.js';

describe('Slot', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return children', () => {
    vi.stubGlobal('__BACKGROUND__', false);
    const children = 'test children';
    const result = Slot({ id: 0, children });
    expect(result).toBe(children);
  });
});
