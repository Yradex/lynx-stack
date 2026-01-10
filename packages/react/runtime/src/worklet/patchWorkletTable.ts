// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
type MTF = Record<string, unknown> & {
  _wkltId: unknown;
  _c?: unknown;
};

interface MTFTableIndexRef {
  $mtfRef: number;
}

let bgMtfTable: unknown[] = [];
let bgMtfIndex: WeakMap<object, number> = new WeakMap();

function isMtfTableIndexRef(value: unknown): value is MTFTableIndexRef {
  return !!value
    && typeof value === 'object'
    && Object.prototype.hasOwnProperty.call(value, '$mtfRef')
    && typeof (value as { $mtfRef?: unknown }).$mtfRef === 'number';
}

function isMtfCtx(value: unknown): value is MTF {
  return !!value
    && typeof value === 'object'
    && Object.prototype.hasOwnProperty.call(value, '_wkltId');
}

export function internMtfCtxForPatch(value: MTF): MTFTableIndexRef {
  const existing = bgMtfIndex.get(value as unknown as object);
  if (existing !== undefined) {
    return { $mtfRef: existing };
  }

  const index = bgMtfTable.length;
  bgMtfIndex.set(value as unknown as object, index);

  bgMtfTable.push(undefined);

  const encoded: Record<string, unknown> = { ...(value as unknown as Record<string, unknown>) };

  const captured = (value as unknown as { _c?: unknown })._c;
  if (captured && typeof captured === 'object' && !Array.isArray(captured)) {
    const encodedCaptured: Record<string, unknown> = { ...(captured as Record<string, unknown>) };
    for (const k of Object.keys(encodedCaptured)) {
      const v = encodedCaptured[k];
      if (isMtfCtx(v)) {
        encodedCaptured[k] = internMtfCtxForPatch(v);
      }
    }
    encoded['_c'] = encodedCaptured;
  }

  bgMtfTable[index] = encoded;
  return { $mtfRef: index };
}

export function takeMtfTableForPatch(): unknown[] | undefined {
  if (bgMtfTable.length === 0) {
    return undefined;
  }
  const table = bgMtfTable;
  bgMtfTable = [];
  bgMtfIndex = new WeakMap();
  return table;
}

let mtMtfTable: unknown[] | undefined;
let mtResolved: unknown[] | undefined;

export function setMtfTableForPatch(table: unknown[] | undefined): void {
  mtMtfTable = table;
  mtResolved = table ? Array.from({ length: table.length }) : undefined;
}

export function clearMtfTableForPatch(): void {
  mtMtfTable = undefined;
  mtResolved = undefined;
}

function resolveMtfRef(index: number): MTF {
  const table = mtMtfTable;
  if (!table) {
    throw new Error('MTF table is not available.');
  }
  if (index < 0 || index >= table.length) {
    throw new Error(`Invalid $mtfRef index: ${index}`);
  }

  const resolved = mtResolved!;
  if (resolved[index] !== undefined) {
    return resolved[index] as unknown as MTF;
  }
  const ctx = table[index] as MTF;
  const captured = (ctx as unknown as { _c?: unknown })._c;
  if (captured && typeof captured === 'object' && !Array.isArray(captured)) {
    for (const k of Object.keys(captured as Record<string, unknown>)) {
      const v = (captured as Record<string, unknown>)[k];
      if (isMtfTableIndexRef(v)) {
        (captured as Record<string, unknown>)[k] = resolveMtfRef(v.$mtfRef);
      }
    }
  }
  resolved[index] = ctx;
  return ctx;
}

export function resolveMtfFromPatch(value: unknown): unknown {
  if (isMtfTableIndexRef(value)) {
    return resolveMtfRef(value.$mtfRef);
  }
  return value;
}
