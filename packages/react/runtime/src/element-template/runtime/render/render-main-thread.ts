// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * Implements the IFR (Instant First-Frame Rendering) on main thread.
 */

import { renderOpcodesIntoElementTemplate } from './render-opcodes.js';
import { profileEnd, profileStart } from '../../../debug/utils.js';
import { render as renderToString } from '../../../renderToOpcodes/index.js';
import { postHydrationData } from '../hydration.js';
import { __page } from '../page/page.js';
import { __root } from '../page/root-instance.js';

function renderMainThread(): void {
  let opcodes;
  if (__PROFILE__) {
    profileStart('ReactLynx::renderMainThread');
  }
  try {
    opcodes = renderToString(__root.__jsx, undefined);
  } catch (e) {
    lynx.reportError(e as Error);
    opcodes = [];
  } finally {
    if (__PROFILE__) {
      profileEnd();
    }
  }

  if (__PROFILE__) {
    profileStart('ReactLynx::renderOpcodes');
  }
  try {
    const instances = renderOpcodesIntoElementTemplate(opcodes, __page);
    postHydrationData(instances);
  } finally {
    if (__PROFILE__) {
      profileEnd();
    }
  }
}

export { renderMainThread };
