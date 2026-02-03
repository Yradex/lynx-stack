// Copyright 2025 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import {
  deleteElementTemplateNativeRef,
  getElementTemplateNativeRef,
  setElementTemplateNativeRef,
} from './registry.js';

// Main-thread IFR allocates ids as consecutive negative integers.
let nextId = -1;

export function createElementTemplateId(nativeRef: ElementRef): number {
  const id = nextId--;
  setElementTemplateNativeRef(id, nativeRef);
  return id;
}

export function resetTemplateId(): void {
  nextId = -1;
}

export function patchElementTemplateById(
  id: number,
  opcodes: any[],
): void {
  const nativeRef = getElementTemplateNativeRefOrThrow(id);
  __PatchElementTemplate(nativeRef, opcodes, null);
}

export function destroyElementTemplateId(id: number): void {
  deleteElementTemplateNativeRef(id);
  // __ReleaseElement(nativeRef);
}

function getElementTemplateNativeRefOrThrow(id: number): ElementRef {
  const nativeRef = getElementTemplateNativeRef(id);
  if (!nativeRef) {
    throw new Error(`ElementTemplate handle ${id} not found.`);
  }
  return nativeRef;
}
