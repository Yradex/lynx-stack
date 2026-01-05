// Copyright 2025 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { ElementTemplateRegistry } from './template/registry.js';

export type ElementTemplatePatchStream = (number | string | null | unknown[])[];

const RAW_TEXT_TEMPLATE_KEY = 'raw-text';

export function applyElementTemplatePatches(stream: ElementTemplatePatchStream): void {
  let i = 0;
  while (i < stream.length) {
    const header = stream[i++] as number;

    if (header === 0) {
      const handleId = stream[i++] as number;
      const templateKey = stream[i++] as string;
      const initPayload = stream[i++] as unknown[] | string;

      if (handleId === 0 && __DEV__) {
        lynx.reportError(new Error('ElementTemplate patch has illegal handleId 0.'));
        continue;
      }

      let nativeRef: ElementRef | null = null;
      if (templateKey === RAW_TEXT_TEMPLATE_KEY) {
        const text = typeof initPayload === 'string' ? initPayload : '';
        nativeRef = __CreateRawText(text);
      } else {
        const initOpcodes = Array.isArray(initPayload) ? initPayload : [];
        resolveOpcodes(initOpcodes);
        nativeRef = __ElementFromBinary(templateKey, null, initOpcodes, null);
      }

      if (nativeRef) {
        ElementTemplateRegistry.set(handleId, { id: handleId, nativeRef });
      }
    } else {
      const targetId = header;
      const opcodes = stream[i++] as unknown[];
      const handle = ElementTemplateRegistry.get(targetId);
      if (!handle) {
        lynx.reportError(new Error(`ElementTemplate patch target ${targetId} not found.`));
        continue;
      }
      resolveOpcodes(opcodes);
      __PatchElementTemplate(handle.nativeRef, opcodes, null);
    }
  }
}

function resolveOpcodes(opcodes: unknown[]): void {
  let i = 0;
  while (i < opcodes.length) {
    const opcode = opcodes[i] as number;
    switch (opcode) {
      case 2: {
        const beforeIndex = i + 2;
        const childIndex = i + 3;
        const beforeId = opcodes[beforeIndex] as number | null;
        const childId = opcodes[childIndex] as number;

        opcodes[beforeIndex] = beforeId == null ? null : resolveHandle(beforeId);
        opcodes[childIndex] = resolveHandle(childId);

        i += 4;
        break;
      }
      case 3: {
        const childIndex = i + 2;
        const childId = opcodes[childIndex] as number;
        opcodes[childIndex] = resolveHandle(childId);
        i += 3;
        break;
      }
      case 4: {
        i += 3;
        break;
      }
      default: {
        lynx.reportError(new Error(`ElementTemplate patch has unknown opcode ${opcode}.`));
        i += 1;
      }
    }
  }
}

function resolveHandle(id: number): ElementRef | null {
  const handle = ElementTemplateRegistry.get(id);
  if (!handle) {
    lynx.reportError(new Error(`ElementTemplate patch handle ${id} not found.`));
    return null;
  }
  return handle.nativeRef;
}
