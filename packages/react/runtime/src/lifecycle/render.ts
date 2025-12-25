// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * Implements the IFR (Instant First-Frame Rendering) on main thread.
 */

import { isValidElement } from 'preact';

import { profileEnd, profileStart } from '../debug/utils.js';
import { renderOpcodesIntoElementTemplate } from '../element-template/renderOpcodesIntoElementTemplate.js';
import { renderOpcodesInto } from '../opcodes.js';
import { render as renderToString } from '../renderToOpcodes/index.js';
import { __root } from '../root.js';
import { SnapshotInstance, __page } from '../snapshot.js';

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

  if (process.env['NODE_ENV'] === 'test' && !__USE_ELEMENT_TEMPLATE__) {
    opcodes = opcodes.map((opcode) => {
      if (isValidElement(opcode) && typeof opcode.type === 'string') {
        return Object.assign(new SnapshotInstance(opcode.type), opcode, { $$typeof: undefined });
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return opcode;
    });
  }

  if (__PROFILE__) {
    profileStart('ReactLynx::renderOpcodes');
  }
  try {
    if (__USE_ELEMENT_TEMPLATE__) {
      /* v8 ignore start */
      if (!__page) {
        throw new Error('ElementTemplate render requires a page root; call setupPage first.');
      }
      /* v8 ignore stop */
      renderOpcodesIntoElementTemplate(opcodes, __page);
    } else {
      renderOpcodesInto(opcodes, __root as SnapshotInstance);
    }

    if (__ENABLE_SSR__ || __USE_ELEMENT_TEMPLATE__) {
      __root.__opcodes = opcodes;
    }
  } finally {
    if (__PROFILE__) {
      profileEnd();
    }
  }
}

export { renderMainThread };
