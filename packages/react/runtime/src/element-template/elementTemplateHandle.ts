// Copyright 2025 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
import { ElementTemplateRegistry } from './elementTemplateRegistry.js';

export interface ElementTemplateHandle {
  id: number;
  nativeRef: ElementRef;
}

let nextId = -1;

export function createElementTemplateHandle(
  nativeRef: ElementRef,
): ElementTemplateHandle {
  const id = nextId--;
  const handle: ElementTemplateHandle = { id, nativeRef };
  ElementTemplateRegistry.set(id, handle);
  return handle;
}

export function resetTemplateId(): void {
  nextId = -1;
}

export function patchElementTemplateHandle(
  handle: ElementTemplateHandle,
  opcodes: any[],
): void {
  __PatchElementTemplate(handle.nativeRef, opcodes, null);
}

export function destroyElementTemplateHandle(
  handle: ElementTemplateHandle,
): void {
  ElementTemplateRegistry.delete(handle.id);
  // __ReleaseElement(handle.nativeRef);
}
