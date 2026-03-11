// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { __OpAttr, __OpBegin, __OpEnd, __OpSlot, __OpText } from '../../../renderToOpcodes/index.js';

interface Frame {
  // Current template Key (vnode.type). null for the initial root frame.
  templateKey: string | null;

  // Collected dynamic attributes passed from transform lowering.
  attributeSlots: unknown[] | undefined;

  // Collected dynamic children keyed by elementSlotIndex.
  elementSlots: ElementRef[][] | undefined;

  // Current active slot id, -1 means none
  activeSlotId: number;

  // Cached array for current active slot to avoid repeated lookups.
  activeElementSlot: ElementRef[] | undefined;
}

export interface MainThreadCreateResult {
  rootRefs: ElementRef[];
}

export function renderOpcodesIntoElementTemplate(
  opcodes: unknown[],
): MainThreadCreateResult {
  const rootRefs: ElementRef[] = [];
  const stack: Frame[] = [
    // Initialize Root Frame
    {
      templateKey: null,
      attributeSlots: undefined,
      elementSlots: undefined,
      activeSlotId: -1,
      activeElementSlot: undefined,
    },
  ];

  for (let i = 0; i < opcodes.length;) {
    const opcode = opcodes[i];
    switch (opcode) {
      case __OpBegin: {
        const vnode = opcodes[i + 1] as { type: string };
        stack.push({
          templateKey: vnode.type,
          attributeSlots: undefined,
          elementSlots: undefined,
          activeSlotId: -1,
          activeElementSlot: undefined,
        });
        i += 2;
        break;
      }
      case __OpEnd: {
        const frame = stack.pop();
        if (!frame) {
          throw new Error('Instruction mismatch: Stack underflow at __OpEnd');
        }

        const templateKey = frame.templateKey;
        // If templateKey is null, it means we popped the root frame?
        // But __OpEnd should pair with __OpBegin.
        // The Root frame is manually pushed and has no __OpBegin.
        // So we should never pop the Root frame via __OpEnd unless there's an extra End.
        if (templateKey === null) {
          // This should effectively not happen if opcodes are balanced?
          // Actually, if we are at root, and opcode has __OpEnd, it implies we are closing a component.
          // The structure is: Root -> [Begin ... End] -> Root.
          // Wait, if opcodes list ends, loop finishes.
          // __OpEnd corresponds to a component.
          // So if we pop, we must get a valid component frame.
          throw new Error('Instruction mismatch: Popped root frame at __OpEnd');
        }

        const elementRef = __CreateElementTemplate(
          templateKey,
          null,
          frame.attributeSlots ?? null,
          frame.elementSlots ?? null,
          null,
        );

        // Append to parent
        const parentFrame = stack[stack.length - 1];
        if (parentFrame) {
          if (parentFrame.templateKey === null) {
            rootRefs.push(elementRef);
          } else {
            if (!parentFrame.activeElementSlot) {
              throw new Error(`Template '${parentFrame.templateKey}' received a child outside of any element slot.`);
            }
            parentFrame.activeElementSlot.push(elementRef);
          }
        }

        i += 1;
        break;
      }
      case __OpAttr: {
        const name = opcodes[i + 1] as string;
        const value = opcodes[i + 2] as unknown[];
        const frame = stack[stack.length - 1];
        if (frame && name === 'attributeSlots') {
          frame.attributeSlots = value;
        }
        i += 3;
        break;
      }
      case __OpSlot: {
        const slotId = opcodes[i + 1] as number;
        const frame = stack[stack.length - 1]!;
        frame.activeSlotId = slotId;
        const elementSlots = frame.elementSlots ?? (frame.elementSlots = []);
        frame.activeElementSlot = elementSlots[slotId] = [];
        i += 2;
        break;
      }
      case __OpText: {
        const text = opcodes[i + 1] as string;
        const frame = stack[stack.length - 1];
        if (frame) {
          const textRef = __CreateRawText(text);

          if (frame.templateKey === null) {
            rootRefs.push(textRef);
          } else {
            if (!frame.activeElementSlot) {
              throw new Error(`Template '${frame.templateKey}' received a text child outside of any element slot.`);
            }
            frame.activeElementSlot.push(textRef);
          }
        }
        i += 2;
        break;
      }
      default:
        // Unknown opcode, maybe skip? or throw?
        // renderToString loop increments manually.
        // If we hit here, something is desync.
        throw new Error(`Unknown opcode: ${opcode as string | number}`);
    }
  }
  return { rootRefs };
}
