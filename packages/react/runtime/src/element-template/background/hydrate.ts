// Copyright 2025 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { BackgroundElementTemplateInstance, BackgroundElementTemplateText } from './instance.js';
import { backgroundElementTemplateInstanceManager } from './manager.js';
import { diffArrayAction } from '../../hydrate.js';
import { isDirectOrDeepEqual } from '../../utils.js';
import type { SerializedETInstance } from '../runtime/hydration.js';
import type { ElementTemplatePatchStream } from '../runtime/patch.js';

const enum ElementTemplatePatchOpcode {
  InsertBefore = 2,
  RemoveChild = 3,
  SetAttributes = 4,
}

const RAW_TEXT_TEMPLATE_KEY = 'raw-text';

interface DiffResult<K> {
  $$diff: true;
  i: Record<number, K>;
  r: number[];
  m: Record<number, number>;
}

export function hydrate(
  before: SerializedETInstance,
  after: BackgroundElementTemplateInstance,
  stream: ElementTemplatePatchStream = [],
): ElementTemplatePatchStream {
  if (before[1] !== after.type && __DEV__) {
    lynx.reportError(
      new Error(
        `ElementTemplate hydrate key mismatch: main='${before[1]}' background='${after.type}'.`,
      ),
    );
    return stream;
  }

  backgroundElementTemplateInstanceManager.updateId(after.instanceId, before[0]);

  if (before[1] === RAW_TEXT_TEMPLATE_KEY) {
    return stream;
  }

  diffAttributes(before[3], after.attrs, after.instanceId, stream);

  const beforeSlots = before[2] ?? {};
  const slotIds = new Set<number>();
  for (const key of Object.keys(beforeSlots)) {
    slotIds.add(Number(key));
  }
  for (const key of after.slotChildren.keys()) {
    slotIds.add(key);
  }

  for (const slotId of slotIds) {
    const beforeChildren = beforeSlots[slotId] ?? [];
    const afterChildren = after.slotChildren.get(slotId) ?? [];
    diffInstanceList(beforeChildren, afterChildren, after.instanceId, slotId, stream);
  }

  return stream;
}

function diffInstanceList(
  beforeList: SerializedETInstance[],
  afterList: BackgroundElementTemplateInstance[],
  parentId: number,
  slotId: number,
  stream: ElementTemplatePatchStream,
): void {
  const beforeMap: Record<string, Array<[SerializedETInstance, number]>> = {};
  for (let i = 0; i < beforeList.length; i += 1) {
    const node = beforeList[i]!;
    const key = getSerializedInstanceKey(node);
    (beforeMap[key] ??= []).push([node, i]);
  }

  const diffResult: DiffResult<BackgroundElementTemplateInstance> = {
    $$diff: true,
    i: {},
    r: [],
    m: {},
  };

  let lastPlacedIndex = 0;
  for (let i = 0; i < afterList.length; i += 1) {
    const afterNode = afterList[i]!;
    const key = getBackgroundInstanceKey(afterNode);
    const beforeNodes = beforeMap[key];
    let beforeNode: [SerializedETInstance, number] | undefined;

    if (beforeNodes && beforeNodes.length) {
      beforeNode = beforeNodes.shift();
    }

    if (beforeNode) {
      const [beforeInstance, oldIndex] = beforeNode;
      hydrate(beforeInstance, afterNode, stream);
      if (oldIndex < lastPlacedIndex) {
        diffResult.m[oldIndex] = i;
      } else {
        lastPlacedIndex = oldIndex;
      }
    } else {
      diffResult.i[i] = afterNode;
    }
  }

  for (const key in beforeMap) {
    for (const [, index] of beforeMap[key]!) {
      diffResult.r.push(index);
    }
  }

  if (isEmptyDiffResult(diffResult)) {
    return;
  }

  diffArrayAction(
    beforeList,
    diffResult,
    (node, target) => {
      const beforeId = target ? target[0] : null;
      reconstructInstanceTree([node], parentId, slotId, beforeId, stream);
      return (target ?? node) as unknown as SerializedETInstance;
    },
    (node) => {
      const childId = node[0];
      pushUpdate(stream, parentId, [
        ElementTemplatePatchOpcode.RemoveChild,
        slotId,
        childId,
      ]);
    },
    (node, target) => {
      const childId = node[0];
      const beforeId = target ? target[0] : null;
      pushUpdate(stream, parentId, [
        ElementTemplatePatchOpcode.InsertBefore,
        slotId,
        beforeId,
        childId,
      ]);
    },
  );
}

function diffAttributes(
  beforeAttrs: Record<number, Record<string, unknown>> | undefined,
  afterAttrs: Map<number, Record<string, unknown>>,
  targetId: number,
  stream: ElementTemplatePatchStream,
): void {
  const beforeMap = new Map<number, Record<string, unknown>>();
  if (beforeAttrs) {
    for (const [partId, props] of Object.entries(beforeAttrs)) {
      beforeMap.set(Number(partId), props);
    }
  }

  const seenParts = new Set<number>();
  for (const [partId, nextProps] of afterAttrs) {
    seenParts.add(partId);
    const prevProps = beforeMap.get(partId);
    const patch: Record<string, unknown> = {};

    for (const key in nextProps) {
      const nextValue = nextProps[key];
      const prevValue = prevProps?.[key];
      if (!isDirectOrDeepEqual(nextValue, prevValue)) {
        patch[key] = nextValue;
      }
    }

    if (prevProps) {
      for (const key in prevProps) {
        if (!(key in nextProps)) {
          patch[key] = undefined;
        }
      }
    }

    if (Object.keys(patch).length > 0) {
      pushUpdate(stream, targetId, [
        ElementTemplatePatchOpcode.SetAttributes,
        partId,
        patch,
      ]);
    }
  }

  for (const [partId, prevProps] of beforeMap) {
    if (seenParts.has(partId)) {
      continue;
    }
    const patch: Record<string, unknown> = {};
    for (const key in prevProps) {
      patch[key] = undefined;
    }
    if (Object.keys(patch).length > 0) {
      pushUpdate(stream, targetId, [
        ElementTemplatePatchOpcode.SetAttributes,
        partId,
        patch,
      ]);
    }
  }
}

function reconstructInstanceTree(
  nodes: BackgroundElementTemplateInstance[],
  parentId: number,
  slotId: number,
  beforeId: number | null,
  stream: ElementTemplatePatchStream,
): void {
  for (const node of nodes) {
    createInstanceNode(node, stream);

    const slotChildren = node.slotChildren;
    for (const [childSlotId, children] of slotChildren) {
      for (const child of children) {
        reconstructInstanceTree([child], node.instanceId, childSlotId, null, stream);
      }
    }

    pushUpdate(stream, parentId, [
      ElementTemplatePatchOpcode.InsertBefore,
      slotId,
      beforeId,
      node.instanceId,
    ]);
  }
}

function createInstanceNode(
  node: BackgroundElementTemplateInstance,
  stream: ElementTemplatePatchStream,
): void {
  if (node.type === RAW_TEXT_TEMPLATE_KEY) {
    const text = node instanceof BackgroundElementTemplateText ? node.text : '';
    pushCreate(stream, node.instanceId, RAW_TEXT_TEMPLATE_KEY, text);
    return;
  }

  const initOpcodes: unknown[] = [];
  for (const [partId, attrs] of node.attrs) {
    initOpcodes.push(ElementTemplatePatchOpcode.SetAttributes, partId, attrs);
  }
  pushCreate(stream, node.instanceId, node.type, initOpcodes);
}

function pushUpdate(
  stream: ElementTemplatePatchStream,
  targetId: number,
  opcodes: unknown[],
): void {
  const lastHeader = stream[stream.length - 2];
  const lastOpcodes = stream[stream.length - 1];
  if (lastHeader === targetId && Array.isArray(lastOpcodes)) {
    lastOpcodes.push(...opcodes);
    return;
  }
  stream.push(targetId, opcodes);
}

function pushCreate(
  stream: ElementTemplatePatchStream,
  handleId: number,
  templateKey: string,
  initOpcodes: unknown[] | string,
): void {
  stream.push(0, handleId, templateKey, initOpcodes);
}

function getSerializedInstanceKey(instance: SerializedETInstance): string {
  if (instance[1] === RAW_TEXT_TEMPLATE_KEY) {
    const text = instance[3]?.[0]?.['text'];
    return `${RAW_TEXT_TEMPLATE_KEY}:${typeof text === 'string' ? text : ''}`;
  }
  return instance[1];
}

function getBackgroundInstanceKey(instance: BackgroundElementTemplateInstance): string {
  if (instance.type === RAW_TEXT_TEMPLATE_KEY) {
    const text = instance instanceof BackgroundElementTemplateText ? instance.text : '';
    return `${RAW_TEXT_TEMPLATE_KEY}:${text}`;
  }
  return instance.type;
}

function isEmptyDiffResult(result: DiffResult<unknown>): boolean {
  return Object.keys(result.i).length === 0
    && result.r.length === 0
    && Object.keys(result.m).length === 0;
}
