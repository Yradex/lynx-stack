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
import { installElementTemplateCommitHook } from '../../../../src/element-template/background/commit-hook.js';
import { ElementTemplateLifecycleConstant } from '../../../../src/element-template/protocol/lifecycle-constant.js';
import type {
  ElementTemplateUpdateCommitContext,
  SerializedElementTemplate,
} from '../../../../src/element-template/protocol/types.js';
import { root } from '../../../../src/element-template/client/root.js';
import { __root as internalRoot } from '../../../../src/element-template/runtime/page/root-instance.js';
import { resetTemplateId } from '../../../../src/element-template/runtime/template/handle.js';
import { ElementTemplateRegistry } from '../../../../src/element-template/runtime/template/registry.js';
import { registerBuiltinRawTextTemplate } from '../../test-utils/debug/registry.js';
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
  hydrationData: SerializedElementTemplate[];
  onHydrate: (event: { data: unknown }) => void;
  root: RootNode;
  nativeLog: unknown[];
  cleanupNative: () => void;
}

export interface UpdateFixtureContext {
  envManager: ElementTemplateEnvManager;
  hydrationData: SerializedElementTemplate[];
  updateEvents: ElementTemplateUpdateCommitContext[];
  onHydrate: (event: { data: unknown }) => void;
  onUpdate: (event: { data: unknown }) => void;
  cleanupNative: () => void;
}

export function setupPatchContext(): PatchContext {
  vi.clearAllMocks();
  ElementTemplateRegistry.clear();
  resetTemplateId();
  registerBuiltinRawTextTemplate();

  const installed = installMockNativePapi({ clearTemplatesOnCleanup: false });

  const envManager = new ElementTemplateEnvManager();
  const hydrationData: SerializedElementTemplate[] = [];

  envManager.resetEnv('background');
  envManager.setUseElementTemplate(true);

  // Core context lives on background thread
  installElementTemplateHydrationListener();

  // JS context lives on main thread
  envManager.switchToMainThread();
  installElementTemplatePatchListener();
  envManager.switchToBackground();

  const onHydrate = vi.fn().mockImplementation((event: { data: unknown }) => {
    const data = event.data;
    if (Array.isArray(data)) {
      for (const item of data) {
        hydrationData.push(item as SerializedElementTemplate);
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

export function setupUpdateFixtureContext(): UpdateFixtureContext {
  vi.clearAllMocks();
  ElementTemplateRegistry.clear();
  resetTemplateId();
  registerBuiltinRawTextTemplate();

  const installed = installMockNativePapi({ clearTemplatesOnCleanup: false });
  const envManager = new ElementTemplateEnvManager();
  const hydrationData: SerializedElementTemplate[] = [];
  const updateEvents: ElementTemplateUpdateCommitContext[] = [];

  envManager.resetEnv('background');
  envManager.setUseElementTemplate(true);

  envManager.switchToBackground();
  installElementTemplateHydrationListener();
  installElementTemplateCommitHook();
  const onHydrate = (event: { data: unknown }) => {
    const data = event.data;
    if (Array.isArray(data)) {
      for (const item of data) {
        hydrationData.push(item as SerializedElementTemplate);
      }
    }
  };
  lynx.getCoreContext().addEventListener(ElementTemplateLifecycleConstant.hydrate, onHydrate);

  envManager.switchToMainThread();
  installElementTemplatePatchListener();
  const onUpdate = (event: { data: unknown }) => {
    updateEvents.push(event.data as ElementTemplateUpdateCommitContext);
  };
  lynx.getJSContext().addEventListener(ElementTemplateLifecycleConstant.update, onUpdate);
  envManager.switchToBackground();

  return {
    envManager,
    hydrationData,
    updateEvents,
    onHydrate,
    onUpdate,
    cleanupNative: installed.cleanup,
  };
}

export function teardownPatchContext(context: PatchContext): void {
  try {
    context.cleanupNative();
  } finally {
    context.envManager.switchToBackground();
    resetElementTemplateHydrationListener();
    lynx.getCoreContext().removeEventListener(ElementTemplateLifecycleConstant.hydrate, context.onHydrate);

    context.envManager.switchToMainThread();
    resetElementTemplatePatchListener();

    context.envManager.setUseElementTemplate(false);
    (globalThis as { __LYNX_REPORT_ERROR_CALLS?: Error[] }).__LYNX_REPORT_ERROR_CALLS = [];
  }
}

export function teardownUpdateFixtureContext(context: UpdateFixtureContext): void {
  try {
    context.cleanupNative();
  } finally {
    context.envManager.switchToBackground();
    resetElementTemplateHydrationListener();
    lynx.getCoreContext().removeEventListener(ElementTemplateLifecycleConstant.hydrate, context.onHydrate);

    context.envManager.switchToMainThread();
    lynx.getJSContext().removeEventListener(ElementTemplateLifecycleConstant.update, context.onUpdate);
    resetElementTemplatePatchListener();

    context.envManager.setUseElementTemplate(false);
    (globalThis as { __LYNX_REPORT_ERROR_CALLS?: Error[] }).__LYNX_REPORT_ERROR_CALLS = [];
  }
}

export function renderAndCollect(App: () => JSX.Element, context: PatchContext): {
  before: SerializedElementTemplate;
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
