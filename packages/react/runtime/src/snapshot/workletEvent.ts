// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
import { onWorkletCtxUpdate } from '@lynx-js/react/worklet-runtime/bindings';
import type { Worklet } from '@lynx-js/react/worklet-runtime/bindings';

import { describeInvalidValue } from '../debug/describeInvalidValue.js';
import { isMainThreadHydrating } from '../lifecycle/patch/isMainThreadHydrating.js';
import { SnapshotInstance } from '../snapshot.js';
import { resolveMtfFromPatch } from '../worklet/patchWorkletTable.js';

function formatEventAttribute(workletType: string, eventType: string, eventName: string): string {
  const suffix = eventType.endsWith('Event') ? eventType.slice(0, -'Event'.length) : eventType;
  return `${workletType}:${suffix}${eventName}`;
}

function reportInvalidWorkletValue(
  snapshot: SnapshotInstance,
  elementIndex: number,
  workletType: string,
  eventType: string,
  eventName: string,
  value: unknown,
): void {
  const eventAttr = formatEventAttribute(workletType, eventType, eventName);
  const element = snapshot.__elements?.[elementIndex];
  const elementTag = element ? __GetTag(element) : 'unknown';
  const elementId = snapshot.__id;
  const snapshotName = snapshot.type;
  const message = `"${eventAttr}" on <${elementTag}> (snapshot ${elementId} "${snapshotName}") expected `
    + 'a main-thread function but received '
    + `${describeInvalidValue(value)}. Did you forget to add a "main thread" directive to the handler?`;
  lynx.reportError(new Error(message));
}

function updateWorkletEvent(
  snapshot: SnapshotInstance,
  expIndex: number,
  oldValue: Worklet,
  elementIndex: number,
  workletType: string,
  eventType: string,
  eventName: string,
): void {
  const rawValue = snapshot.__values![expIndex];
  const resolved = resolveMtfFromPatch(rawValue);
  if (resolved !== rawValue) {
    snapshot.__values![expIndex] = resolved;
  }
  if (!snapshot.__elements) {
    return;
  }
  if (__DEV__ && resolved !== null && resolved !== undefined && typeof resolved !== 'object') {
    reportInvalidWorkletValue(snapshot, elementIndex, workletType, eventType, eventName, resolved);
    return;
  }
  const value = (resolved ?? {}) as Worklet;
  value._workletType = workletType;

  if (workletType === 'main-thread') {
    onWorkletCtxUpdate(value, oldValue, isMainThreadHydrating, snapshot.__elements[elementIndex]!);
    const event = {
      type: 'worklet',
      value,
    };
    __AddEvent(snapshot.__elements[elementIndex]!, eventType, eventName, event);
  }
}

export { updateWorkletEvent };
