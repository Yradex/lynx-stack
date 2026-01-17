// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { vi } from 'vitest';

import { BackgroundElementTemplateInstance } from '../../../../src/element-template/background/instance.js';
import { installMockNativePapi } from '../../test-utils/mock/mockNativePapi.js';
import {
  installElementTemplatePatchListener,
  resetElementTemplatePatchListener,
} from '../../../../src/element-template/native/patch-listener.js';
import {
  installElementTemplateHydrationListener,
  resetElementTemplateHydrationListener,
} from '../../../../src/element-template/background/hydration-listener.js';
import { ElementTemplateLifecycleConstant } from '../../../../src/element-template/protocol/lifecycle-constant.js';
import type { SerializedETInstance } from '../../../../src/element-template/protocol/types.js';
import { root } from '../../../../src/element-template/client/root.js';
import { __root as internalRoot } from '../../../../src/element-template/runtime/page/root-instance.js';
import { resetTemplateId } from '../../../../src/element-template/runtime/template/handle.js';
import { ElementTemplateRegistry } from '../../../../src/element-template/runtime/template/registry.js';
import { ElementTemplateEnvManager } from '../../test-utils/debug/envManager.js';

declare const renderPage: () => void;

interface RootWithFirstChild {
  firstChild: BackgroundElementTemplateInstance | null;
}

interface RootNode {
  type: 'root';
}

export interface PatchContext {
  envManager: ElementTemplateEnvManager;
  hydrationData: SerializedETInstance[];
  onHydrate: (event: { data: unknown }) => void;
  root: RootNode;
  nativeLog: unknown[];
  cleanupNative: () => void;
}

export function setupPatchContext(): PatchContext {
  vi.clearAllMocks();
  ElementTemplateRegistry.clear();
  resetTemplateId();

  const installed = installMockNativePapi({ clearTemplatesOnCleanup: false });

  const envManager = new ElementTemplateEnvManager();
  const hydrationData: SerializedETInstance[] = [];

  envManager.resetEnv('background');
  envManager.setUseElementTemplate(true);
  installElementTemplateHydrationListener();
  installElementTemplatePatchListener();

  const onHydrate = vi.fn().mockImplementation((event: { data: unknown }) => {
    const data = event.data;
    if (Array.isArray(data)) {
      for (const item of data) {
        hydrationData.push(item as SerializedETInstance);
      }
    }
  });
  lynx.getCoreContext().addEventListener(ElementTemplateLifecycleConstant.hydrate, onHydrate);

  return {
    envManager,
    hydrationData,
    onHydrate,
    root: { type: 'root' },
    nativeLog: installed.nativeLog,
    cleanupNative: installed.cleanup,
  };
}

export function teardownPatchContext(context: PatchContext): void {
  try {
    context.cleanupNative();
  } finally {
    resetElementTemplateHydrationListener();
    resetElementTemplatePatchListener();
    lynx.getCoreContext().removeEventListener(ElementTemplateLifecycleConstant.hydrate, context.onHydrate);
    context.envManager.setUseElementTemplate(false);
    (globalThis as { __LYNX_REPORT_ERROR_CALLS?: Error[] }).__LYNX_REPORT_ERROR_CALLS = [];
  }
}

export function renderAndCollect(App: () => JSX.Element, context: PatchContext): {
  before: SerializedETInstance;
  after: BackgroundElementTemplateInstance;
} {
  root.render(<App />);
  context.envManager.switchToMainThread();
  renderPage();
  context.envManager.switchToBackground();

  const before = context.hydrationData[0];
  if (!before) {
    throw new Error('Missing hydration data.');
  }

  const backgroundRoot = internalRoot as unknown as RootWithFirstChild;
  const after = backgroundRoot.firstChild;
  if (!after) {
    throw new Error('Missing background root child.');
  }

  return { before, after };
}
