// Copyright 2025 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElementTemplateRegistry } from '../../../../src/element-template/runtime/template/registry.js';
import {
  createElementTemplateHandle,
  destroyElementTemplateHandle,
  patchElementTemplateHandle,
} from '../../../../src/element-template/runtime/template/handle.js';
import { resetTemplateId } from '../../../../src/element-template/runtime/template/handle.js';

describe('ElementTemplateHandle', () => {
  const mockNativeRef = { __isNativeRef: true };
  const mockPatchElementTemplate = vi.fn();
  // const mockReleaseElement = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('__PatchElementTemplate', mockPatchElementTemplate);
    // vi.stubGlobal('__ReleaseElement', mockReleaseElement);
    ElementTemplateRegistry.clear();
    resetTemplateId();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should create and register a handle', () => {
    const handle = createElementTemplateHandle(mockNativeRef as any);

    expect(handle).toEqual({ id: -1, nativeRef: mockNativeRef });
    expect(ElementTemplateRegistry.get(-1)).toBe(handle);
  });

  it('should patch a handle by calling native API', () => {
    const handle = createElementTemplateHandle(mockNativeRef as any);
    const opcodes = ['some', 'opcodes'];

    patchElementTemplateHandle(handle, opcodes);

    expect(mockPatchElementTemplate).toHaveBeenCalledWith(mockNativeRef, opcodes, null);
  });

  it('should destroy and unregister a handle', () => {
    const handle = createElementTemplateHandle(mockNativeRef as any);

    expect(ElementTemplateRegistry.has(handle.id)).toBe(true);

    destroyElementTemplateHandle(handle);

    expect(ElementTemplateRegistry.has(handle.id)).toBe(false);
    // expect(mockReleaseElement).toHaveBeenCalledWith(mockNativeRef);
  });
});
