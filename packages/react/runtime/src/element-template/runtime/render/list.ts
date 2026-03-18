// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import type { RuntimeOptions } from '../../protocol/types.js';
import { __page } from '../page/page.js';
import { reserveElementTemplateId } from '../template/handle.js';
import { setElementTemplateNativeRef } from '../template/registry.js';

export const ELEMENT_TEMPLATE_LIST_OPTION = '__elementTemplateList';

type ElementTemplateListOptions = RuntimeOptions & {
  [ELEMENT_TEMPLATE_LIST_OPTION]?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function annotateListHandle(
  list: ElementRef,
  templateKey: string,
  handleId: number,
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

  const { [ELEMENT_TEMPLATE_LIST_OPTION]: _list, ...runtimeOptions } = options;
  return Object.keys(runtimeOptions).length > 0 ? runtimeOptions : undefined;
}

function normalizeListCells(
  elementSlots: ElementRef[][] | null | undefined,
): ElementRef[] {
  return [...(elementSlots?.[0] ?? [])];
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

  const materializeCell = (cellIndex: number, operationID: number): number => {
    const cell = cells[cellIndex];
    if (!cell) {
      throw new Error(`ElementTemplate list cell not found at index ${cellIndex}.`);
    }

    const sign = __GetElementUniqueID(cell);
    if (!mounted.has(cellIndex)) {
      __AppendElement(list, cell as FiberElement);
      mounted.add(cellIndex);
      __FlushElementTree(cell, {
        triggerLayout: true,
        operationID,
        elementID: sign,
        listID,
      });
    }

    return sign;
  };

  const componentAtIndex: ComponentAtIndexCallback = (
    _list,
    _listID,
    cellIndex,
    operationID,
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
  ) => {
    const elementIDs = cellIndexes.map((cellIndex, index) => materializeCell(cellIndex, operationIDs[index] ?? 0));

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
  options?: RuntimeOptions,
): ElementRef {
  const runtimeOptions = stripInternalListOption(options as ElementTemplateListOptions | undefined);
  const pageId = getPageUniqueId();
  const cells = normalizeListCells(elementSlots);
  const handleId = reserveElementTemplateId();
  const list = __CreateList(
    pageId,
    () => undefined,
    () => undefined,
    {},
    () => undefined,
  );
  const listID = __GetElementUniqueID(list);
  const [componentAtIndex, componentAtIndexes] = createListCallbacks(list, listID, cells);

  __UpdateListCallbacks(
    list,
    componentAtIndex,
    () => undefined,
    componentAtIndexes,
  );

  setElementTemplateNativeRef(handleId, list);
  annotateListHandle(list, templateKey, handleId, {
    ...(runtimeOptions ?? {}),
    handleId,
  });

  return list;
}
