// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
import type { ElementTemplateCommitContext } from '../protocol/types.js';

export const GlobalCommitContext: ElementTemplateCommitContext = {
  patches: [],
  flushOptions: {},
  flowIds: undefined,
};

export function resetGlobalCommitContext(): void {
  GlobalCommitContext.patches = [];
  GlobalCommitContext.flushOptions = {};
  GlobalCommitContext.flowIds = undefined;
}
