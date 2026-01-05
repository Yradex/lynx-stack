// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { __OpAttr, __OpBegin, __OpEnd, __OpSlotBegin, __OpSlotEnd, __OpText } from '../../../renderToOpcodes/index.js';
import type { SerializedETInstance } from '../hydration.js';
import { createElementTemplateHandle } from '../template/handle.js';

interface Frame {
  // Current template Key (vnode.type). null for the initial root frame.
  templateKey: string | null;

  // Collected dynamic attributes: Map<partId, attributes>
  attrs: Record<number, Record<string, any>>;

  // Collected Slot children: Map<slotId, ChildNode[]>
  slotChildren: Map<number, ElementRef[]>;

  // Current active slot stack
  activeSlotStack: number[];
}

interface RootNode {}

function createFrame(templateKey: string | null): Frame {
  return {
    templateKey,
    attrs: {},
    slotChildren: new Map(),
    activeSlotStack: [],
  };
}

export function renderOpcodesIntoElementTemplate(
  opcodes: unknown[],
  root: RootNode,
): SerializedETInstance[] {
  const rootInstances: SerializedETInstance[] = [];
  const stack: Frame[] = [];
  // Initialize Root Frame
  stack.push(createFrame(null));

  const hydrationMap = new Map<ElementRef, SerializedETInstance>();

  for (let i = 0; i < opcodes.length;) {
    const opcode = opcodes[i];
    switch (opcode) {
      case __OpBegin: {
        const vnode = opcodes[i + 1] as { type: string };
        stack.push(createFrame(vnode.type));
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

        // Construct Init Opcodes
        // 1. setAttributes: [4, partId, attributes]
        // 2. insertBefore: [2, slotId, null, childRef]
        const initOpcodes: any[] = [];

        for (const [partId, attributes] of Object.entries(frame.attrs)) {
          initOpcodes.push(4, Number(partId), attributes);
        }

        for (const [slotId, children] of frame.slotChildren) {
          for (const child of children) {
            initOpcodes.push(2, slotId, null, child);
          }
        }

        // Create Element Template Instance
        const elementRef = __ElementFromBinary(
          templateKey,
          null,
          initOpcodes,
          null,
        );

        // Register Handle
        const handle = createElementTemplateHandle(elementRef);

        // Collect Hydration Info
        const serializedInstance: SerializedETInstance = [
          handle.id,
          templateKey,
          {},
          // Only include attrs if not empty for optimization?
          // For now, keep it simple.
          { ...frame.attrs },
        ];

        for (const [slotId, children] of frame.slotChildren) {
          serializedInstance[2][slotId] = children.map((child) => {
            return hydrationMap.get(child)!;
          });
        }

        hydrationMap.set(elementRef, serializedInstance);

        // Append to parent
        const parentFrame = stack[stack.length - 1];
        if (parentFrame) {
          if (parentFrame.templateKey === null) {
            // Parent is root frame
            __AppendElement(root, elementRef as FiberElement);
            rootInstances.push(serializedInstance);
          } else {
            // Parent is another template
            // Must append to parent's active slot
            if (parentFrame.activeSlotStack.length === 0) {
              // This implies a component is direct child of another component without Slot?
              // In Element Template, children MUST be in a Slot or invalid?
              // Or maybe it's a direct attribute?
              // The design says: "Exception! Text/Node must be in a Slot"
              // Only root children can be without slot? (No, because we just handled root case)
              // If we are here, we are inside a template frame.
              // Templates only accept children via Slots.
              lynx.reportError(
                new Error(
                  `ElementTemplate: Content encountered outside of any Slot in template '${parentFrame.templateKey}'. Content dropped.`,
                ),
              );
            } else {
              const currentSlot = parentFrame.activeSlotStack[
                parentFrame.activeSlotStack.length - 1
              ];
              const list = parentFrame.slotChildren.get(currentSlot!);
              if (list) {
                list.push(elementRef);
              } else {
                parentFrame.slotChildren.set(currentSlot!, [elementRef]);
              }
            }
          }
        }

        i += 1;
        break;
      }
      case __OpAttr: {
        const name = opcodes[i + 1] as string;
        const value = opcodes[i + 2] as Record<string, any>;
        const frame = stack[stack.length - 1];
        if (frame && name === 'attrs') {
          // value is { partId: { key: val } }
          // Merge into frame.attrs
          // Note: value structure from compiler/renderToOpcodes might be { 0: {...}, 1: {...} }
          // We can just Object.assign or iterate.
          // Since renderToOpcodes passes the object directly, we can merge.
          // frame.attrs is Record<number, ...>
          // We should merge safely.
          Object.assign(frame.attrs, value);
        }
        // Ignore other attributes for now (static ones handled by template)
        i += 3;
        break;
      }
      case __OpSlotBegin: {
        const slotId = opcodes[i + 1] as number;
        const frame = stack[stack.length - 1];
        if (frame) {
          frame.activeSlotStack.push(slotId);
        }
        i += 2;
        break;
      }
      case __OpSlotEnd: {
        const frame = stack[stack.length - 1];
        if (frame) {
          frame.activeSlotStack.pop();
        }
        i += 1;
        break;
      }
      case __OpText: {
        const text = opcodes[i + 1] as string;
        const frame = stack[stack.length - 1];
        if (frame) {
          const textRef = __CreateRawText(text);
          const textHandle = createElementTemplateHandle(textRef);
          const serializedText: SerializedETInstance = [
            textHandle.id,
            'raw-text',
            {},
            { 0: { text } },
          ];
          hydrationMap.set(textRef, serializedText);

          if (frame.templateKey === null) {
            // Root text
            __AppendElement(root, textRef);
          } else {
            // Inside template
            if (frame.activeSlotStack.length === 0) {
              lynx.reportError(
                new Error(
                  `ElementTemplate: Text encountered outside of any Slot in template '${frame.templateKey}'. Content: '${text}'`,
                ),
              );
            } else {
              const currentSlot = frame.activeSlotStack[frame.activeSlotStack.length - 1];
              const list = frame.slotChildren.get(currentSlot!);
              if (list) {
                list.push(textRef);
              } else {
                frame.slotChildren.set(currentSlot!, [textRef]);
              }
            }
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
  return rootInstances;
}
