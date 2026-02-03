// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { profileEnd, profileStart } from '../../../debug/utils.js';
import { __OpAttr, __OpBegin, __OpEnd, __OpSlot, __OpText } from '../../../renderToOpcodes/index.js';
import type { SerializedETInstance } from '../../protocol/types.js';
import { createElementTemplateId } from '../template/handle.js';

function shouldProfileRenderOpcodesBreakdown(): boolean {
  // Fine-grained spans inside the opcode loop are expensive (per-instance).
  // Keep them off by default; enable explicitly for local profiling.
  return __PROFILE__ && (globalThis as Record<string, unknown>)['__ET_PROFILE_RENDER_OPCODES_BREAKDOWN__'] === true;
}

const EMPTY_INIT_OPCODES: any[] = [];
const EMPTY_SLOT_CHILDREN = Object.freeze(Object.create(null)) as Record<number, SerializedETInstance[]>;

interface Frame {
  // Current template Key (vnode.type). null for the initial root frame.
  templateKey: string | null;

  // Collected dynamic attributes: Map<partId, attributes>
  attrs: Record<number, Record<string, any>> | undefined;

  // Collected Slot children: Map<slotId, SerializedETInstance[]>
  // Lazily allocated on first write.
  slotChildren: Record<number, SerializedETInstance[]> | undefined;

  // Collected Slot children refs: Map<slotId, ElementRef[]>
  // Lazily allocated on first write.
  slotChildrenRef: Record<number, ElementRef[]> | undefined;

  // Current active slot id, -1 means none
  activeSlotId: number;
}

interface RootNode {}

export function renderOpcodesIntoElementTemplate(
  opcodes: unknown[],
  root: RootNode,
): SerializedETInstance[] {
  const rootInstances: SerializedETInstance[] = [];
  const stack: Frame[] = [
    // Initialize Root Frame
    {
      templateKey: null,
      attrs: undefined,
      slotChildren: undefined,
      slotChildrenRef: undefined,
      activeSlotId: -1,
    },
  ];

  for (let i = 0; i < opcodes.length;) {
    const opcode = opcodes[i];
    switch (opcode) {
      case __OpBegin: {
        const vnode = opcodes[i + 1] as { type: string };
        stack.push({
          templateKey: vnode.type,
          attrs: undefined,
          slotChildren: undefined,
          slotChildrenRef: undefined,
          activeSlotId: -1,
        });
        i += 2;
        break;
      }
      case __OpEnd: {
        const profileBreakdown = shouldProfileRenderOpcodesBreakdown();

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
        if (profileBreakdown) {
          profileStart('ReactLynx::renderOpcodes::buildInitOpcodes');
        }
        let initOpcodes: any[] | undefined;

        if (frame.attrs) {
          initOpcodes = [];
          for (const partIdString in frame.attrs) {
            initOpcodes.push(4, Number(partIdString), frame.attrs[partIdString as unknown as number]);
          }
        }

        if (frame.slotChildrenRef) {
          initOpcodes ??= [];
          for (const slotIdString in frame.slotChildrenRef) {
            const slotId = Number(slotIdString);
            const childrenRefs = frame.slotChildrenRef[slotIdString as unknown as number]!;
            for (let childIndex = 0; childIndex < childrenRefs.length; childIndex += 1) {
              initOpcodes.push(2, slotId, null, childrenRefs[childIndex]);
            }
          }
        }

        if (profileBreakdown) {
          profileEnd();
        }

        // Create Element Template Instance
        if (profileBreakdown) {
          profileStart('ReactLynx::renderOpcodes::__ElementFromBinary');
        }
        const elementRef = __ElementFromBinary(
          templateKey,
          null,
          initOpcodes ?? EMPTY_INIT_OPCODES,
          null,
        );

        if (profileBreakdown) {
          profileEnd();
        }

        // Register Handle
        if (profileBreakdown) {
          profileStart('ReactLynx::renderOpcodes::createHandle');
        }
        const id = createElementTemplateId(elementRef);

        // Collect Hydration Info
        const serializedInstance: SerializedETInstance = [
          id,
          templateKey,
          frame.slotChildren ?? EMPTY_SLOT_CHILDREN,
          // Only include attrs if not empty for optimization?
          // For now, keep it simple.
          frame.attrs,
        ];

        // Append to parent
        const parentFrame = stack[stack.length - 1];
        if (parentFrame) {
          if (parentFrame.templateKey === null) {
            // Parent is root frame
            __AppendElement(root, elementRef as FiberElement);
            rootInstances.push(serializedInstance);
          } else {
            const currentSlot = parentFrame.activeSlotId;
            const slotChildrenRef = parentFrame.slotChildrenRef
              ?? (parentFrame.slotChildrenRef = Object.create(null) as Record<number, ElementRef[]>);
            (slotChildrenRef[currentSlot] ??= []).push(elementRef);

            const slotChildren = parentFrame.slotChildren
              ?? (parentFrame.slotChildren = Object.create(null) as Record<number, SerializedETInstance[]>);
            (slotChildren[currentSlot] ??= []).push(serializedInstance);
          }
        }

        if (profileBreakdown) {
          profileEnd();
        }

        i += 1;
        break;
      }
      case __OpAttr: {
        const name = opcodes[i + 1] as string;
        const value = opcodes[i + 2] as Record<string, any>;
        const frame = stack[stack.length - 1];
        if (frame && name === 'attrs') {
          frame.attrs = value;
        }
        // Ignore other attributes for now (static ones handled by template)
        i += 3;
        break;
      }
      case __OpSlot: {
        const slotId = opcodes[i + 1] as number;
        const frame = stack[stack.length - 1];
        frame!.activeSlotId = slotId;
        i += 2;
        break;
      }
      case __OpText: {
        const text = opcodes[i + 1] as string;
        const frame = stack[stack.length - 1];
        if (frame) {
          const textRef = __CreateRawText(text);
          const textId = createElementTemplateId(textRef);
          const serializedText: SerializedETInstance = [
            textId,
            'raw-text',
            {},
            { 0: { text } },
          ];

          if (frame.templateKey === null) {
            // Root text
            __AppendElement(root, textRef);
          } else {
            // Inside template
            const currentSlot = frame.activeSlotId;
            const slotChildrenRef = frame.slotChildrenRef
              ?? (frame.slotChildrenRef = Object.create(null) as Record<number, ElementRef[]>);
            (slotChildrenRef[currentSlot] ??= []).push(textRef);

            const slotChildren = frame.slotChildren
              ?? (frame.slotChildren = Object.create(null) as Record<number, SerializedETInstance[]>);
            (slotChildren[currentSlot] ??= []).push(serializedText);
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
