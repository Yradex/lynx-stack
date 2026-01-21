// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { markTiming, setPipeline } from '../lynx/performance.js';
import { ElementTemplateLifecycleConstant } from '../protocol/lifecycle-constant.js';
import type { ElementTemplateCommitContext, ElementTemplateFlushOptions } from '../protocol/types.js';
import { __page } from '../runtime/page/page.js';
import { applyElementTemplatePatches } from '../runtime/patch.js';

let listener:
  | ((event: { data: unknown }) => void)
  | undefined;

export function installElementTemplatePatchListener(): void {
  resetElementTemplatePatchListener();

  listener = (event: { data: unknown }) => {
    const { data } = event;
    const payload = data as ElementTemplateCommitContext;
    const flushOptions = payload?.flushOptions ?? {};
    const pipelineOptions = flushOptions.pipelineOptions;
    setPipeline(pipelineOptions);
    const flowIds = Array.isArray(payload?.flowIds) && payload.flowIds.length > 0
      ? payload.flowIds
      : undefined;
    const shouldProfilePatch = !!flowIds
      && typeof lynx.performance?.profileStart === 'function'
      && typeof lynx.performance?.profileEnd === 'function';

    if (shouldProfilePatch) {
      lynx.performance.profileStart('ReactLynx::patch', {
        flowId: flowIds[0],
        flowIds,
      });
    }

    if (Array.isArray(payload?.patches)) {
      markTiming('mtsRenderStart');
      markTiming('parseChangesStart');
      markTiming('parseChangesEnd');
      markTiming('patchChangesStart');
      try {
        applyElementTemplatePatches(payload.patches);
      } finally {
        markTiming('patchChangesEnd');
        markTiming('mtsRenderEnd');
      }
    }

    __FlushElementTree(__page, flushOptions);

    if (shouldProfilePatch) {
      lynx.performance.profileEnd();
    }
  };

  lynx.getJSContext().addEventListener(
    ElementTemplateLifecycleConstant.update,
    listener,
  );
}

export function resetElementTemplatePatchListener(): void {
  if (listener) {
    lynx.getJSContext().removeEventListener(
      ElementTemplateLifecycleConstant.update,
      listener,
    );
  }
  listener = undefined;
}
