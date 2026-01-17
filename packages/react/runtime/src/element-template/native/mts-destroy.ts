// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { resetElementTemplatePatchListener } from './patch-listener.js';

export function installOnMtsDestruction(): void {
  lynx.getNative?.().addEventListener('__DestroyLifetime', onMtsDestruction);
}

export function onMtsDestruction(): void {
  lynx.performance.profileStart('ReactLynx::onMtsDestruction');
  resetElementTemplatePatchListener();
  lynx.performance.profileEnd();
  lynx.getNative?.().removeEventListener('__DestroyLifetime', onMtsDestruction);
}
