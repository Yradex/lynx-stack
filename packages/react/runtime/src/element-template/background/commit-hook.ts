// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { options } from 'preact';

import { GlobalCommitContext, resetGlobalCommitContext } from './commit-context.js';
import { COMMIT } from '../../renderToOpcodes/constants.js';
import { hook } from '../../utils.js';
import { ElementTemplateLifecycleConstant } from '../protocol/lifecycle-constant.js';

let installed = false;
let hasHydrated = false;

export function markElementTemplateHydrated(): void {
  hasHydrated = true;
}

export function resetElementTemplateCommitState(): void {
  hasHydrated = false;
  resetGlobalCommitContext();
}

export function installElementTemplateCommitHook(): void {
  if (installed) {
    return;
  }
  installed = true;

  hook(options, COMMIT, (originalCommit, vnode, commitQueue) => {
    if (__BACKGROUND__ && hasHydrated && GlobalCommitContext.patches.length > 0) {
      lynx.getCoreContext().dispatchEvent({
        type: ElementTemplateLifecycleConstant.update,
        data: {
          patches: GlobalCommitContext.patches,
          flushOptions: GlobalCommitContext.flushOptions,
        },
      });
      resetGlobalCommitContext();
    }

    originalCommit?.(vnode, commitQueue);
  });
}
