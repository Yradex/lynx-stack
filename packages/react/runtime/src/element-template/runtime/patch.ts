// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { ElementTemplateRegistry } from './template/registry.js';
import { ElementTemplateUpdateOps } from '../protocol/opcodes.js';
import type { ElementTemplateUpdateOp } from '../protocol/opcodes.js';
import type { ElementTemplateUpdateCommandStream, SerializableValue } from '../protocol/types.js';

export type { ElementTemplateUpdateCommandStream } from '../protocol/types.js';

export function applyElementTemplateUpdateCommands(
  stream: ElementTemplateUpdateCommandStream,
): void {
  let i = 0;
  while (i < stream.length) {
    const op = stream[i++] as ElementTemplateUpdateOp;

    switch (op) {
      case ElementTemplateUpdateOps.createTemplate: {
        const handleId = stream[i++] as number;
        const templateKey = stream[i++] as string;
        const bundleUrl = stream[i++] as string | null | undefined;
        const attributeSlots = stream[i++] as SerializableValue[] | null | undefined;
        const elementSlots = stream[i++] as number[][] | null | undefined;

        if (handleId === 0 && __DEV__) {
          lynx.reportError(new Error('ElementTemplate update has illegal handleId 0.'));
          continue;
        }

        const nativeRef = __CreateElementTemplate(
          templateKey,
          bundleUrl,
          attributeSlots,
          resolveElementSlots(elementSlots),
          { handleId },
        );

        if (nativeRef) {
          ElementTemplateRegistry.set(handleId, nativeRef);
        }
        break;
      }

      case ElementTemplateUpdateOps.setAttribute: {
        const targetId = stream[i++] as number;
        const attrSlotIndex = stream[i++] as number;
        const value = stream[i++] as SerializableValue | null;
        const nativeRef = resolveHandle(targetId, 'target');
        if (!nativeRef) {
          continue;
        }
        __SetAttributeOfElementTemplate(nativeRef, attrSlotIndex, value, null);
        break;
      }

      case ElementTemplateUpdateOps.insertNode: {
        const targetId = stream[i++] as number;
        const elementSlotIndex = stream[i++] as number;
        const childId = stream[i++] as number;
        const referenceId = stream[i++] as number;
        const nativeRef = resolveHandle(targetId, 'target');
        const childRef = resolveHandle(childId, 'child');
        if (!nativeRef || !childRef) {
          continue;
        }
        const referenceRef = referenceId === 0 ? null : resolveHandle(referenceId, 'reference');
        if (referenceId !== 0 && !referenceRef) {
          continue;
        }
        __InsertNodeToElementTemplate(nativeRef, elementSlotIndex, childRef, referenceRef);
        break;
      }

      case ElementTemplateUpdateOps.removeNode: {
        const targetId = stream[i++] as number;
        const elementSlotIndex = stream[i++] as number;
        const childId = stream[i++] as number;
        const nativeRef = resolveHandle(targetId, 'target');
        const childRef = resolveHandle(childId, 'child');
        if (!nativeRef || !childRef) {
          continue;
        }
        __RemoveNodeFromElementTemplate(nativeRef, elementSlotIndex, childRef);
        break;
      }

      default: {
        lynx.reportError(new Error(`ElementTemplate update opcode ${String(op)} is not supported.`));
      }
    }
  }
}

function resolveElementSlots(
  elementSlots: number[][] | null | undefined,
): ElementRef[][] | null {
  if (!Array.isArray(elementSlots)) {
    return null;
  }

  return elementSlots.map((children) => {
    if (!Array.isArray(children)) {
      return [];
    }

    return children
      .map((childId) => resolveHandle(childId, 'child'))
      .filter((childRef): childRef is ElementRef => childRef !== null);
  });
}

function resolveHandle(id: number, role: string): ElementRef | null {
  const nativeRef = ElementTemplateRegistry.get(id);
  if (!nativeRef) {
    lynx.reportError(new Error(`ElementTemplate update ${role} handle ${id} not found.`));
    return null;
  }
  return nativeRef;
}
