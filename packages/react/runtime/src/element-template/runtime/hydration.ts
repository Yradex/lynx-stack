// Copyright 2025 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// [id, templateKey, slots, attrs]
import { ElementTemplateLifecycleConstant } from './lifecycle-constant.js';

export type SerializedETInstance = [
  number,
  string,
  Record<number, SerializedETInstance[]>,
  Record<number, Record<string, unknown>>?,
];

export function postHydrationData(instances: SerializedETInstance[]): void {
  __OnLifecycleEvent([
    ElementTemplateLifecycleConstant.hydrate,
    instances,
  ]);
}
