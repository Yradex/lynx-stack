// Copyright 2025 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { GlobalCommitContext, resetGlobalCommitContext } from './commit-context.js';
import {
  BackgroundElementTemplateInstance,
  BackgroundElementTemplateSlot,
  BackgroundElementTemplateText,
} from './instance.js';
import { backgroundElementTemplateInstanceManager } from './manager.js';
import type { ElementTemplatePatchStream, SerializedETInstance } from '../protocol/types.js';

const RAW_TEXT_TEMPLATE_KEY = 'raw-text';

export function hydrate(
  before: SerializedETInstance,
  after: BackgroundElementTemplateInstance,
): ElementTemplatePatchStream {
  resetGlobalCommitContext();
  hydrateIntoContext(before, after);
  return GlobalCommitContext.patches;
}

export function hydrateIntoContext(
  before: SerializedETInstance,
  after: BackgroundElementTemplateInstance,
  created?: Set<number>,
): void {
  hydrateImpl(before, after, created ?? new Set<number>());
}

interface DiffResult<K> {
  $$diff: true;
  i: Record<number, K>;
  r: number[];
  m: Record<number, number>;
}

function diffArrayAction<T, K>(
  before: T[],
  diffResult: DiffResult<K>,
  onInsert: (node: K, target: T | undefined) => T,
  onRemove: (node: T) => void,
  onMove: (node: T, target: T | undefined) => void,
): T[] {
  const deleteSet = new Set(diffResult.r);
  const { i: insertMap, m: placementMap } = diffResult;
  const moveTempMap = new Map<number, T>();
  let old: T | undefined;
  let k = 0;
  old = before[k];
  const result: T[] = [];
  let i = 0;
  let j = 0;
  let remain = Object.keys(insertMap).length;
  while (old || remain > 0) {
    let keep = false;
    if (old && deleteSet.has(j)) {
      onRemove(old);
    } else if (old && placementMap[j] !== undefined) {
      moveTempMap.set(placementMap[j]!, old);
      remain += 1;
    } else {
      let newNode = old;
      if (moveTempMap.has(i)) {
        newNode = moveTempMap.get(i)!;
        keep = true;
        onMove(newNode, old);
        remain -= 1;
      } else if (insertMap[i] !== undefined) {
        newNode = onInsert(insertMap[i]!, old);
        keep = true;
        remain -= 1;
      }

      result.push(newNode!);
      i += 1;
    }
    if (old && !keep) {
      old = before[++k];
      j += 1;
    }
  }

  return result;
}

function hydrateImpl(
  before: SerializedETInstance,
  after: BackgroundElementTemplateInstance,
  created: Set<number>,
): void {
  if (before[1] !== after.type && __DEV__) {
    lynx.reportError(
      new Error(
        `ElementTemplate hydrate key mismatch: main='${before[1]}' background='${after.type}'.`,
      ),
    );
    return;
  }

  backgroundElementTemplateInstanceManager.updateId(after.instanceId, before[0]);

  if (before[1] === RAW_TEXT_TEMPLATE_KEY) {
    return;
  }

  const beforeAttrs = before[3] ?? {};
  const bgAttrs = after._attrs;
  after._attrs = beforeAttrs;
  after.setAttribute('attrs', bgAttrs);

  const beforeSlots = before[2] ?? {};
  const slotIds = new Set<number>();
  for (const key of Object.keys(beforeSlots)) {
    slotIds.add(Number(key));
  }

  for (const slotId of slotIds) {
    syncSlotChildren(after, slotId, beforeSlots[slotId] ?? [], created);
  }

  for (const slotId of after.slotChildren.keys()) {
    if (slotIds.has(slotId)) {
      continue;
    }
    syncSlotChildren(after, slotId, [], created);
  }
}

function syncSlotChildren(
  parent: BackgroundElementTemplateInstance,
  slotId: number,
  beforeChildren: SerializedETInstance[],
  created: Set<number>,
): void {
  const slot = ensureSlot(parent, slotId);

  const afterChildren = collectChildren(slot);

  const beforeMap: Record<string, Array<[SerializedETInstance, number]>> = {};
  for (let i = 0; i < beforeChildren.length; i += 1) {
    const node = beforeChildren[i]!;
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
  for (let i = 0; i < afterChildren.length; i += 1) {
    const afterNode = afterChildren[i]!;
    const key = getBackgroundInstanceKey(afterNode);
    const beforeNodes = beforeMap[key];
    let beforeNode: [SerializedETInstance, number] | undefined;

    if (beforeNodes && beforeNodes.length) {
      beforeNode = beforeNodes.shift();
    }

    if (beforeNode) {
      const [beforeInstance, oldIndex] = beforeNode;
      hydrateImpl(beforeInstance, afterNode, created);
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

  const mainOrder: BackgroundElementTemplateInstance[] = [];
  for (const serialized of beforeChildren) {
    const reused = backgroundElementTemplateInstanceManager.get(serialized[0]);
    mainOrder.push(reused ?? createPlaceholder(serialized));
  }

  replaceChildren(slot, mainOrder);

  diffArrayAction(
    beforeChildren,
    diffResult,
    (node, target) => {
      const beforeId = target ? target[0] : null;
      const beforeChild = beforeId == null
        ? null
        : backgroundElementTemplateInstanceManager.get(beforeId)!;
      emitCreateRecursive(node, created);
      slot.insertBefore(node, beforeChild);
      return (target ?? node) as unknown as SerializedETInstance;
    },
    (node) => {
      const childId = node[0];
      const child = backgroundElementTemplateInstanceManager.get(childId);
      if (child && child.parent === slot) {
        slot.removeChild(child);
      }
    },
    (node, target) => {
      const childId = node[0];
      const child = backgroundElementTemplateInstanceManager.get(childId);
      const beforeId = target ? target[0] : null;
      const beforeChild = beforeId == null
        ? null
        : backgroundElementTemplateInstanceManager.get(beforeId)!;
      if (child && child.parent === slot) {
        slot.insertBefore(child, beforeChild);
      }
    },
  );
}

function emitCreateRecursive(node: BackgroundElementTemplateInstance, created: Set<number>): void {
  if (created.has(node.instanceId)) {
    return;
  }
  created.add(node.instanceId);
  node.emitCreate();
  if (node.type === RAW_TEXT_TEMPLATE_KEY) {
    return;
  }

  let slot = node.firstChild;
  while (slot) {
    if (slot instanceof BackgroundElementTemplateSlot && slot.partId !== -1) {
      const children = collectChildren(slot);
      for (const child of children) {
        emitCreateRecursive(child, created);
      }

      replaceChildren(slot, []);

      for (const child of children) {
        slot.insertBefore(child, null);
      }
    }
    slot = slot.nextSibling;
  }
}

function ensureSlot(
  parent: BackgroundElementTemplateInstance,
  slotId: number,
): BackgroundElementTemplateSlot {
  let child = parent.firstChild;
  while (child) {
    if (child instanceof BackgroundElementTemplateSlot && child.partId === slotId) {
      return child;
    }
    child = child.nextSibling;
  }

  const slot = new BackgroundElementTemplateSlot();
  slot.setAttribute('id', slotId);
  parent.appendChild(slot);
  return slot;
}

function collectChildren(slot: BackgroundElementTemplateSlot): BackgroundElementTemplateInstance[] {
  const res: BackgroundElementTemplateInstance[] = [];
  let child = slot.firstChild;
  while (child) {
    res.push(child);
    child = child.nextSibling;
  }
  return res;
}

function replaceChildren(
  parent: BackgroundElementTemplateInstance,
  children: BackgroundElementTemplateInstance[],
): void {
  let child = parent.firstChild;
  while (child) {
    const next = child.nextSibling;
    child.parent = null;
    child.nextSibling = null;
    child.previousSibling = null;
    child = next;
  }

  parent.firstChild = null;
  parent.lastChild = null;

  let prev: BackgroundElementTemplateInstance | null = null;
  for (const c of children) {
    c.parent = parent;
    c.previousSibling = prev;
    c.nextSibling = null;
    if (prev) {
      prev.nextSibling = c;
    } else {
      parent.firstChild = c;
    }
    prev = c;
    parent.lastChild = c;
  }
}

function createPlaceholder(serialized: SerializedETInstance): BackgroundElementTemplateInstance {
  const [id, type, , attrs] = serialized;
  let node: BackgroundElementTemplateInstance;
  if (type === RAW_TEXT_TEMPLATE_KEY) {
    const text = attrs?.[0]?.['text'];
    node = new BackgroundElementTemplateText(typeof text === 'string' ? text : '');
  } else {
    node = new BackgroundElementTemplateInstance(type);
  }
  backgroundElementTemplateInstanceManager.updateId(node.instanceId, id);
  return node;
}

function isEmptyDiffResult(result: DiffResult<unknown>): boolean {
  return Object.keys(result.i).length === 0
    && result.r.length === 0
    && Object.keys(result.m).length === 0;
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
