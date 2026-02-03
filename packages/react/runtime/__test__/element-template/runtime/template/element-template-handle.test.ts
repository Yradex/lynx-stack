// Copyright 2025 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElementTemplateRegistry } from '../../../../src/element-template/runtime/template/registry.js';
import {
  createElementTemplateId,
  destroyElementTemplateId,
  patchElementTemplateById,
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
    const id = createElementTemplateId(mockNativeRef as any);

    expect(id).toBe(-1);
    expect(ElementTemplateRegistry.get(-1)).toBe(mockNativeRef);
  });

  it('should patch a handle by calling native API', () => {
    const id = createElementTemplateId(mockNativeRef as any);
    const opcodes = ['some', 'opcodes'];

    patchElementTemplateById(id, opcodes);

    expect(mockPatchElementTemplate).toHaveBeenCalledWith(mockNativeRef, opcodes, null);
  });

  it('should throw when patching a missing handle id', () => {
    expect(() => {
      patchElementTemplateById(-999, ['op']);
    }).toThrowError('ElementTemplate handle -999 not found.');
  });

  it('should destroy and unregister a handle', () => {
    const id = createElementTemplateId(mockNativeRef as any);

    expect(ElementTemplateRegistry.has(id)).toBe(true);

    destroyElementTemplateId(id);

    expect(ElementTemplateRegistry.has(id)).toBe(false);
    // expect(mockReleaseElement).toHaveBeenCalledWith(mockNativeRef);
  });
});
