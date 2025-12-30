// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
import '../../hooks/react.js';

import { injectCalledByNative } from './main-thread-api.js';
import { setupLynxEnv } from '../../lynx/env.js';
import { registerSlot } from '../../renderToOpcodes/index.js';
import { setupBackgroundElementTemplateDocument } from '../background/document.js';
import { Slot } from '../runtime/components/slot.js';

registerSlot(Slot);
setupLynxEnv();

if (__MAIN_THREAD__) {
  injectCalledByNative();
}

if (__BACKGROUND__) {
  setupBackgroundElementTemplateDocument();
}

// setupLynxEnv();
