// Copyright 2025 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

export type SerializedETInstance = [
  number,
  string,
  Record<number, SerializedETInstance[]>,
  Record<number, Record<string, unknown>>?,
];

export type ElementTemplatePatchStream = (number | string | null | unknown[])[];

export interface ElementTemplateCommitContext {
  patches: ElementTemplatePatchStream;
  flushOptions: Record<string, unknown>;
}
