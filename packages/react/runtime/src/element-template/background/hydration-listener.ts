// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
import { hydrate } from './hydrate.js';
import { BackgroundElementTemplateInstance } from './instance.js';
import { ElementTemplateLifecycleConstant } from '../protocol/lifecycle-constant.js';
import type { ElementTemplatePatchStream, SerializedETInstance } from '../protocol/types.js';
import { __root } from '../runtime/page/root-instance.js';

let listener:
  | ((event: { data: unknown }) => void)
  | undefined;

export function installElementTemplateHydrationListener(): void {
  resetElementTemplateHydrationListener();

  listener = (event: { data: unknown }) => {
    const { data } = event;
    const instances = data as SerializedETInstance[];
    const root = __root as BackgroundElementTemplateInstance;

    const stream: ElementTemplatePatchStream = [];
    let after = root.firstChild;
    for (const before of instances) {
      if (!after) {
        break;
      }
      hydrate(before, after, stream);
      after = after.nextSibling;
    }

    if (stream.length > 0) {
      lynx.getCoreContext().dispatchEvent({
        type: ElementTemplateLifecycleConstant.update,
        data: stream,
      });
    }
  };

  lynx.getCoreContext().addEventListener(ElementTemplateLifecycleConstant.hydrate, listener);
}

export function resetElementTemplateHydrationListener(): void {
  if (listener) {
    lynx.getCoreContext().removeEventListener(ElementTemplateLifecycleConstant.hydrate, listener);
  }
  listener = undefined;
}
