// Copyright 2025 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ElementTemplateRegistry,
  createElementTemplateHandle,
  destroyElementTemplateHandle,
  patchElementTemplateHandle,
} from '../../src/index';

describe('ElementTemplateHandle', () => {
  const mockNativeRef = { __isNativeRef: true };
  const mockPatchElementTemplate = vi.fn();
  // const mockReleaseElement = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('__PatchElementTemplate', mockPatchElementTemplate);
    // vi.stubGlobal('__ReleaseElement', mockReleaseElement);
    ElementTemplateRegistry.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should create and register a handle', () => {
    const id = 123;
    const handle = createElementTemplateHandle(id, mockNativeRef as any);

    expect(handle).toEqual({ id, nativeRef: mockNativeRef });
    expect(ElementTemplateRegistry.get(id)).toBe(handle);
  });

  it('should patch a handle by calling native API', () => {
    const id = 456;
    const handle = createElementTemplateHandle(id, mockNativeRef as any);
    const opcodes = ['some', 'opcodes'];

    patchElementTemplateHandle(handle, opcodes);

    expect(mockPatchElementTemplate).toHaveBeenCalledWith(mockNativeRef, opcodes, null);
  });

  it('should destroy and unregister a handle', () => {
    const id = 789;
    const handle = createElementTemplateHandle(id, mockNativeRef as any);

    expect(ElementTemplateRegistry.has(id)).toBe(true);

    destroyElementTemplateHandle(handle);

    expect(ElementTemplateRegistry.has(id)).toBe(false);
    // expect(mockReleaseElement).toHaveBeenCalledWith(mockNativeRef);
  });
});
