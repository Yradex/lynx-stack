// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import type { RuntimeOptions, SerializableValue } from '../../protocol/types.js';
import { __page } from '../page/page.js';
import { reserveElementTemplateId } from '../template/handle.js';
import { setElementTemplateNativeRef } from '../template/registry.js';

export const ELEMENT_TEMPLATE_LIST_OPTION = '__elementTemplateList';
export const ELEMENT_TEMPLATE_ATTRIBUTES_OPTION = '__elementTemplateAttributes';
const LIST_ITEM_PLATFORM_INFO_KEYS = /* @__PURE__ */ new Set<string>([
  'reuse-identifier',
  'full-span',
  'item-key',
  'sticky-top',
  'sticky-bottom',
  'estimated-height',
  'estimated-height-px',
  'estimated-main-axis-size-px',
  'recyclable',
]);
const LIST_ITEM_PLATFORM_INFO_VIRTUAL_KEYS = /* @__PURE__ */ new Set<string>([
  'reuse-identifier',
  'recyclable',
]);

type ElementTemplateListOptions = RuntimeOptions & {
  [ELEMENT_TEMPLATE_LIST_OPTION]?: boolean;
  [ELEMENT_TEMPLATE_ATTRIBUTES_OPTION]?: SerializableValue;
};

type ElementTemplateAttributeDescriptor =
  | {
    kind: 'attribute';
    binding: 'static';
    key?: string;
    value?: SerializableValue;
  }
  | {
    kind: 'attribute';
    binding: 'slot';
    key?: string;
    attrSlotIndex?: number;
  }
  | {
    kind: 'spread';
    binding: 'slot';
    attrSlotIndex?: number;
  };

type SerializableRecord = Record<string, SerializableValue | undefined>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function annotateListHandle(
  list: ElementRef,
  templateKey: string,
  handleId: number,
  attributeSlots: SerializableValue[] | null | undefined,
  options: RuntimeOptions,
): void {
  if (!isRecord(list)) {
    return;
  }

  Object.defineProperties(list, {
    templateId: {
      configurable: true,
      enumerable: true,
      value: templateKey,
      writable: true,
    },
    __handleId: {
      configurable: true,
      enumerable: false,
      value: handleId,
      writable: true,
    },
    __attributeSlots: {
      configurable: true,
      enumerable: false,
      value: attributeSlots ?? null,
      writable: true,
    },
    __options: {
      configurable: true,
      enumerable: false,
      value: options,
      writable: true,
    },
  });
}

function stripInternalListOption(
  options: ElementTemplateListOptions | undefined,
): RuntimeOptions | undefined {
  if (!options) {
    return undefined;
  }

  const {
    [ELEMENT_TEMPLATE_LIST_OPTION]: _list,
    [ELEMENT_TEMPLATE_ATTRIBUTES_OPTION]: _attributes,
    ...runtimeOptions
  } = options;
  return Object.keys(runtimeOptions).length > 0 ? runtimeOptions : undefined;
}

function normalizeListCells(
  elementSlots: ElementRef[][] | null | undefined,
): ElementRef[] {
  return [...(elementSlots?.[0] ?? [])];
}

function toAttributeDescriptors(
  value: SerializableValue | undefined,
): ElementTemplateAttributeDescriptor[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(slotValue => isRecord(slotValue)) as ElementTemplateAttributeDescriptor[];
}

function normalizeAttrKey(key: string): string {
  return key === 'className' ? 'class' : key;
}

function getSpreadSlotValue(
  attributeSlots: SerializableValue[] | null | undefined,
  attrSlotIndex: number | undefined,
): SerializableRecord | undefined {
  const direct = attributeSlots?.[attrSlotIndex ?? -1];
  if (isRecord(direct) && !Array.isArray(direct) && '__spread' in direct) {
    return direct as SerializableRecord;
  }

  const spreadSlot = attributeSlots?.find((slotValue) =>
    isRecord(slotValue) && !Array.isArray(slotValue) && '__spread' in slotValue
  );
  if (spreadSlot && isRecord(spreadSlot) && !Array.isArray(spreadSlot)) {
    return spreadSlot as SerializableRecord;
  }

  return undefined;
}

function readValueFromSpreadSlot(
  spreadValue: SerializableRecord | undefined,
  key: string,
): SerializableValue | undefined {
  if (!spreadValue) {
    return undefined;
  }

  if (key in spreadValue) {
    return spreadValue[key];
  }

  if (key === 'class' && 'className' in spreadValue) {
    return spreadValue['className'];
  }

  return undefined;
}

function stringifyAttributeValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return '';
}

function applyAttribute(target: FiberElement, key: string, value: unknown): void {
  if (key === 'class' || key === 'className') {
    __SetClasses(target, value == null ? '' : stringifyAttributeValue(value));
    return;
  }

  if (key === 'style') {
    __SetInlineStyles(target, value ?? '');
    return;
  }

  if (key === 'id') {
    __SetID(target, value == null ? null : stringifyAttributeValue(value));
    return;
  }

  __SetAttribute(target, key, value ?? null);
}

function applyListAttributes(
  list: FiberElement,
  descriptors: ElementTemplateAttributeDescriptor[],
  attributeSlots: SerializableValue[] | null | undefined,
): void {
  let datasetTouched = false;
  const dataset: Record<string, unknown> = {};

  for (const descriptor of descriptors) {
    if (descriptor.kind === 'attribute') {
      const key = descriptor.key;
      if (!key) {
        continue;
      }

      const normalizedKey = normalizeAttrKey(key);
      let value: unknown;
      if (descriptor.binding === 'static') {
        value = descriptor.value;
      } else {
        const hasDirectSlot = Array.isArray(attributeSlots)
          && descriptor.attrSlotIndex !== undefined
          && descriptor.attrSlotIndex in attributeSlots;
        const direct = attributeSlots?.[descriptor.attrSlotIndex ?? -1];
        if (hasDirectSlot) {
          value = isRecord(direct) && '__spread' in direct
            ? readValueFromSpreadSlot(direct, key)
            : direct;
        } else {
          value = readValueFromSpreadSlot(
            getSpreadSlotValue(attributeSlots, descriptor.attrSlotIndex),
            key,
          );
        }
      }

      if (value === undefined && descriptor.binding === 'static') {
        continue;
      }

      if (normalizedKey.startsWith('data-')) {
        datasetTouched = true;
        const datasetKey = normalizedKey.slice(5);
        if (value === undefined || value === null) {
          delete dataset[datasetKey];
        } else {
          dataset[datasetKey] = value;
        }
      } else {
        applyAttribute(list, normalizedKey, value);
      }
      continue;
    }

    const spreadValue = getSpreadSlotValue(attributeSlots, descriptor.attrSlotIndex);
    if (!spreadValue) {
      continue;
    }

    for (const [spreadKey, spreadAttrValue] of Object.entries(spreadValue)) {
      if (spreadKey === '__spread') {
        continue;
      }

      const normalizedKey = normalizeAttrKey(spreadKey);
      if (normalizedKey.startsWith('data-')) {
        datasetTouched = true;
        dataset[normalizedKey.slice(5)] = spreadAttrValue;
      } else {
        applyAttribute(list, normalizedKey, spreadAttrValue);
      }
    }
  }

  if (datasetTouched) {
    __SetDataset(list, dataset);
  }
}

function extractListItemPlatformInfo(cell: ElementRef): Record<string, unknown> | undefined {
  if (!isRecord(cell) || !Array.isArray(cell['__attributeSlots'])) {
    return undefined;
  }

  const platformInfo: Record<string, unknown> = {};
  for (const slotValue of cell['__attributeSlots']) {
    if (!isRecord(slotValue)) {
      continue;
    }

    for (const key of LIST_ITEM_PLATFORM_INFO_KEYS) {
      if (key in slotValue) {
        platformInfo[key] = slotValue[key];
      }
    }
  }

  return Object.keys(platformInfo).length > 0 ? platformInfo : undefined;
}

function applyListItemPlatformInfo(cell: ElementRef): void {
  const platformInfo = extractListItemPlatformInfo(cell);
  if (!platformInfo) {
    return;
  }

  for (const [key, value] of Object.entries(platformInfo)) {
    if (LIST_ITEM_PLATFORM_INFO_VIRTUAL_KEYS.has(key)) {
      continue;
    }
    __SetAttribute(cell as FiberElement, key, value);
  }
}

function getPageUniqueId(): number {
  try {
    return __GetElementUniqueID(__page);
  } catch {
    return 0;
  }
}

function createListCallbacks(
  list: FiberElement,
  listID: number,
  cells: ElementRef[],
): readonly [ComponentAtIndexCallback, ComponentAtIndexesCallback] {
  const mounted = new Set<number>();

  const materializeCell = (
    cellIndex: number,
    operationID: number,
    enableBatchRender: boolean = false,
    asyncFlush: boolean = false,
  ): number => {
    const cell = cells[cellIndex];
    if (!cell) {
      throw new Error(`ElementTemplate list cell not found at index ${cellIndex}.`);
    }

    const sign = __GetElementUniqueID(cell);
    if (!mounted.has(cellIndex)) {
      applyListItemPlatformInfo(cell);
      __AppendElement(list, cell as FiberElement);
      mounted.add(cellIndex);
      if (enableBatchRender && asyncFlush) {
        __FlushElementTree(cell, {
          asyncFlush: true,
        });
      } else if (!enableBatchRender) {
        __FlushElementTree(cell, {
          triggerLayout: true,
          operationID,
          elementID: sign,
          listID,
        });
      }
    }

    return sign;
  };

  const componentAtIndex: ComponentAtIndexCallback = (
    _list,
    _listID,
    cellIndex,
    operationID,
    _enableReuseNotification,
  ) => {
    const sign = materializeCell(cellIndex, operationID);

    /* v8 ignore start */
    if (process.env['NODE_ENV'] === 'test') {
      return sign;
    }
    return sign;
    /* v8 ignore end */
  };

  const componentAtIndexes: ComponentAtIndexesCallback = (
    _list,
    _listID,
    cellIndexes,
    operationIDs,
    _enableReuseNotification,
    asyncFlush,
  ) => {
    const elementIDs = cellIndexes.map((cellIndex, index) =>
      materializeCell(cellIndex, operationIDs[index] ?? 0, true, asyncFlush)
    );

    __FlushElementTree(list, {
      triggerLayout: true,
      operationIDs,
      elementIDs,
      listID,
    });

    /* v8 ignore start */
    if (process.env['NODE_ENV'] === 'test') {
      return elementIDs as unknown as number;
    }
    return undefined;
    /* v8 ignore end */
  };

  return [componentAtIndex, componentAtIndexes] as const;
}

export function isElementTemplateList(
  options: RuntimeOptions | undefined,
): options is ElementTemplateListOptions {
  return Boolean(options?.[ELEMENT_TEMPLATE_LIST_OPTION]);
}

export function createElementTemplateListWithHandle(
  templateKey: string,
  elementSlots: ElementRef[][] | null | undefined,
  attributeSlots: SerializableValue[] | null | undefined,
  options?: RuntimeOptions,
): ElementRef {
  const listOptions = options as ElementTemplateListOptions | undefined;
  const runtimeOptions = stripInternalListOption(listOptions);
  const pageId = getPageUniqueId();
  const cells = normalizeListCells(elementSlots);
  const handleId = reserveElementTemplateId();
  const attributeDescriptors = toAttributeDescriptors(listOptions?.[ELEMENT_TEMPLATE_ATTRIBUTES_OPTION]);
  const list = __CreateList(
    pageId,
    () => undefined,
    () => undefined,
    {},
    () => undefined,
  );
  const listID = __GetElementUniqueID(list);
  applyListAttributes(list, attributeDescriptors, attributeSlots);
  const [componentAtIndex, componentAtIndexes] = createListCallbacks(list, listID, cells);

  __UpdateListCallbacks(
    list,
    componentAtIndex,
    () => undefined,
    componentAtIndexes,
  );

  setElementTemplateNativeRef(handleId, list);
  annotateListHandle(
    list,
    templateKey,
    handleId,
    attributeSlots,
    {
      ...(runtimeOptions ?? {}),
      handleId,
    },
  );

  return list;
}
