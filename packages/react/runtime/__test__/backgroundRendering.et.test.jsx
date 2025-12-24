// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { Component } from 'preact';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { replaceCommitHook } from '../src/lifecycle/patch/commit';
import { injectUpdateMainThread } from '../src/lifecycle/patch/updateMainThread';
import '../src/lynx/component';
import { __root } from '../src/root';
import { setupPage } from '../src/snapshot';
import { globalEnvManager } from './utils/envManager';
import { elementTree } from './utils/nativeMethod';
import { root } from '../src/lynx-api';

beforeAll(() => {
  setupPage(__CreatePage('0', 0));
  injectUpdateMainThread();
  replaceCommitHook();
});

beforeEach(() => {
  globalEnvManager.resetEnv();
  // @ts-ignore
  globalThis.__USE_ELEMENT_TEMPLATE__ = true;
});

afterEach(() => {
  vi.restoreAllMocks();
  elementTree.clear();
  // @ts-ignore
  globalThis.__USE_ELEMENT_TEMPLATE__ = false;
});

describe('background render with Element Template', () => {
  it('should NOT render component during background render when __USE_ELEMENT_TEMPLATE__ is true', async () => {
    class Comp extends Component {
      render() {
        return <text>{`Hello World`}</text>;
      }
    }

    globalEnvManager.switchToBackground();
    root.render(<Comp />);

    // Since background rendering is disabled, __root should NOT have children
    expect(__root.__firstChild).toBeNull();
    // But __root.__jsx should still be set
    expect(__root.__jsx).toBeDefined();
  });
});
