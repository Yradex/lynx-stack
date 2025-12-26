// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
import '../../hooks/react.js';

import { injectCalledByNative } from './mainThreadApi.js';
import { registerSlot } from '../../renderToOpcodes/index.js';
import { Slot } from '../runtime/components/slot.js';

registerSlot(Slot);

if (__MAIN_THREAD__) {
  injectCalledByNative();
}

// setupLynxEnv();
