// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import {
  createElementTemplateListCellRef,
  createElementTemplateListWithHandle,
  isElementTemplateList,
  splitListItemAttributeSlots,
} from './list.js';
import { __OpAttr, __OpBegin, __OpEnd, __OpSlot, __OpText } from '../../../renderToOpcodes/index.js';
import type { RuntimeOptions, SerializableValue } from '../../protocol/types.js';
import { createElementTemplateWithHandle } from '../template/handle.js';

const BUILTIN_RAW_TEXT_TEMPLATE_KEY = '__et_builtin_raw_text__';

interface Frame {
  // Current template Key (vnode.type). null for the initial root frame.
  templateKey: string | null;

  // Collected dynamic attributes passed from transform lowering.
  attributeSlots: SerializableValue[] | undefined;

  // Collected dynamic children keyed by elementSlotIndex.
  elementSlots: Array<Array<ElementRef | ReturnType<typeof createElementTemplateListCellRef>>> | undefined;

  // Create-time metadata forwarded into __CreateElementTemplate options.
  options: RuntimeOptions | undefined;

  // Cached array for current active slot to avoid repeated lookups.
  activeElementSlot: ElementRef[] | undefined;
}

export interface MainThreadCreateResult {
  rootRefs: ElementRef[];
}

function appendChildToParent(
  parentFrame: Frame | undefined,
  rootRefs: ElementRef[],
  elementRef: ElementRef,
): void {
  if (!parentFrame) {
    return;
  }

  if (parentFrame.templateKey === null) {
    rootRefs.push(elementRef);
    return;
  }

  if (!parentFrame.activeElementSlot) {
    throw new Error(`Template '${parentFrame.templateKey}' received a child outside of any element slot.`);
  }

  parentFrame.activeElementSlot.push(elementRef);
}

function appendListAwareChildToParent(
  parentFrame: Frame | undefined,
  rootRefs: ElementRef[],
  elementRef: ElementRef,
  templateKey: string,
  templateAttributeSlots: SerializableValue[] | null,
  platformInfo: Record<string, unknown> | null,
): void {
  if (!parentFrame) {
    return;
  }

  if (parentFrame.templateKey === null) {
    rootRefs.push(elementRef);
    return;
  }

  if (!parentFrame.activeElementSlot) {
    throw new Error(`Template '${parentFrame.templateKey}' received a child outside of any element slot.`);
  }

  if (isElementTemplateList(parentFrame.options)) {
    parentFrame.activeElementSlot.push(
      createElementTemplateListCellRef(
        elementRef,
        templateKey,
        templateAttributeSlots,
        platformInfo,
      ),
    );
    return;
  }

  parentFrame.activeElementSlot.push(elementRef);
}

function createListAwareElementRef(
  frame: Frame,
  parentFrame: Frame | undefined,
  templateKey: string,
): {
  elementRef: ElementRef;
  templateAttributeSlots: SerializableValue[] | null;
  platformInfo: Record<string, unknown> | null;
} {
  const isListCell = Boolean(parentFrame && isElementTemplateList(parentFrame.options));
  const {
    templateAttributeSlots,
    platformInfo,
  } = isListCell
    ? splitListItemAttributeSlots(frame.attributeSlots ?? null)
    : {
      templateAttributeSlots: frame.attributeSlots ?? null,
      platformInfo: null,
    };

  const elementRef = isElementTemplateList(frame.options)
    ? createElementTemplateListWithHandle(
      templateKey,
      frame.elementSlots ?? null,
      templateAttributeSlots,
      frame.options,
    )
    : createElementTemplateWithHandle(
      templateKey,
      null,
      templateAttributeSlots,
      frame.elementSlots ?? null,
      frame.options,
    );

  return {
    elementRef,
    templateAttributeSlots,
    platformInfo,
  };
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
      options: undefined,
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
          options: undefined,
          activeElementSlot: undefined,
        });
        i += 2;
        break;
      }
      case __OpEnd: {
        const frame = stack.pop();
        /* v8 ignore next 3 */
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

        const parentFrame = stack[stack.length - 1];
        const currentOptions = frame.options;
        const parentOptions = parentFrame?.options;

        if (!currentOptions && !parentOptions) {
          const elementRef = createElementTemplateWithHandle(
            templateKey,
            null,
            frame.attributeSlots ?? null,
            frame.elementSlots ?? null,
            currentOptions,
          );

          appendChildToParent(parentFrame, rootRefs, elementRef);
          i += 1;
          break;
        }

        const currentIsList = isElementTemplateList(currentOptions);
        const parentIsList = Boolean(parentFrame && isElementTemplateList(parentOptions));

        if (!currentIsList && !parentIsList) {
          const elementRef = createElementTemplateWithHandle(
            templateKey,
            null,
            frame.attributeSlots ?? null,
            frame.elementSlots ?? null,
            currentOptions,
          );

          appendChildToParent(parentFrame, rootRefs, elementRef);
          i += 1;
          break;
        }

        const {
          elementRef,
          templateAttributeSlots,
          platformInfo,
        } = createListAwareElementRef(frame, parentFrame, templateKey);

        appendListAwareChildToParent(
          parentFrame,
          rootRefs,
          elementRef,
          templateKey,
          templateAttributeSlots,
          platformInfo,
        );

        i += 1;
        break;
      }
      case __OpAttr: {
        const name = opcodes[i + 1] as string;
        const value = opcodes[i + 2] as SerializableValue;
        const frame = stack[stack.length - 1];
        if (frame) {
          if (name === 'attributeSlots') {
            frame.attributeSlots = value as SerializableValue[];
          } else if (name === 'options') {
            frame.options = value as RuntimeOptions;
          }
        }
        i += 3;
        break;
      }
      case __OpSlot: {
        const slotId = opcodes[i + 1] as number;
        const frame = stack[stack.length - 1]!;
        const elementSlots = frame.elementSlots ?? (frame.elementSlots = []);
        frame.activeElementSlot = elementSlots[slotId] = [];
        i += 2;
        break;
      }
      case __OpText: {
        const text = opcodes[i + 1] as string;
        const frame = stack[stack.length - 1];
        if (frame) {
          const textRef = createElementTemplateWithHandle(
            BUILTIN_RAW_TEXT_TEMPLATE_KEY,
            null,
            [String(text)],
            [],
            undefined,
          );

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
