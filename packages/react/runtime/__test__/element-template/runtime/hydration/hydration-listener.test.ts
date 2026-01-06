import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  installElementTemplateHydrationListener,
  resetElementTemplateHydrationListener,
} from '../../../../src/element-template/background/hydration-listener.js';
import { BackgroundElementTemplateInstance } from '../../../../src/element-template/background/instance.js';
import { backgroundElementTemplateInstanceManager } from '../../../../src/element-template/background/manager.js';
import { ElementTemplateLifecycleConstant } from '../../../../src/element-template/protocol/lifecycle-constant.js';
import type { SerializedETInstance } from '../../../../src/element-template/protocol/types.js';
import { __root } from '../../../../src/element-template/runtime/page/root-instance.js';
import { ElementTemplateEnvManager } from '../../test-utils/envManager.js';
import { flushCoreContextEvents } from '../../test-utils/mockNativePapi/context.js';
import { installMockNativePapi } from '../../test-utils/mockNativePapi.js';

import '../../../../src/element-template/native/index.js';

interface LynxMock {
  getJSContext(): { dispatchEvent(event: { type: string; data: unknown }): number };
}

interface TTMock {
  callDestroyLifetimeFun?: () => void;
}

describe('ElementTemplate hydration listener', () => {
  const envManager = new ElementTemplateEnvManager();
  let cleanupMock: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    const mock = installMockNativePapi();
    cleanupMock = mock.cleanup;
    resetElementTemplateHydrationListener();
    envManager.resetEnv('background');
  });

  afterEach(() => {
    resetElementTemplateHydrationListener();
    cleanupMock();
  });

  it('hydrates instances sent from main thread', () => {
    envManager.switchToBackground();
    installElementTemplateHydrationListener();

    const backgroundRoot = __root as BackgroundElementTemplateInstance;
    const after = new BackgroundElementTemplateInstance('_et_test');
    backgroundRoot.appendChild(after);
    const oldId = after.instanceId;

    envManager.switchToMainThread();
    const instances: SerializedETInstance[] = [
      [-1, '_et_test', {}, {}],
      [-2, '_et_test', {}, {}],
    ];
    lynx.getJSContext().dispatchEvent({
      type: ElementTemplateLifecycleConstant.hydrate,
      data: instances,
    });

    const lynxObj = (globalThis as unknown as { lynx: LynxMock }).lynx;
    lynxObj.getJSContext().dispatchEvent({
      type: '_unknown',
      data: { not: 'an array' },
    });

    envManager.switchToBackground();

    expect(backgroundElementTemplateInstanceManager.get(oldId)).toBeUndefined();
    expect(backgroundElementTemplateInstanceManager.get(-1)).toBe(after);
    expect(backgroundElementTemplateInstanceManager.get(-2)).toBeUndefined();
  });

  it('does nothing when events are flushed on main thread', () => {
    envManager.switchToBackground();
    installElementTemplateHydrationListener();

    const backgroundRoot = __root as BackgroundElementTemplateInstance;
    const after = new BackgroundElementTemplateInstance('_et_test');
    backgroundRoot.appendChild(after);
    const oldId = after.instanceId;

    envManager.switchToMainThread();
    const instances: SerializedETInstance[] = [[-1, '_et_test', {}, {}]];
    lynx.getJSContext().dispatchEvent({
      type: ElementTemplateLifecycleConstant.hydrate,
      data: instances,
    });

    flushCoreContextEvents();

    envManager.switchToBackground();
    expect(backgroundElementTemplateInstanceManager.get(oldId)).toBe(after);
    expect(backgroundElementTemplateInstanceManager.get(-1)).toBeUndefined();
  });

  it('cleans up hydrate listener via tt.callDestroyLifetimeFun', () => {
    envManager.switchToBackground();
    installElementTemplateHydrationListener();

    const backgroundRoot = __root as BackgroundElementTemplateInstance;
    const after = new BackgroundElementTemplateInstance('_et_test');
    backgroundRoot.appendChild(after);
    const oldId = after.instanceId;

    const tt = (globalThis as unknown as { lynxCoreInject: { tt: TTMock } }).lynxCoreInject.tt;
    tt.callDestroyLifetimeFun?.();

    envManager.switchToMainThread();
    const instances: SerializedETInstance[] = [[-1, '_et_test', {}, {}]];
    lynx.getJSContext().dispatchEvent({
      type: ElementTemplateLifecycleConstant.hydrate,
      data: instances,
    });

    envManager.switchToBackground();
    expect(backgroundElementTemplateInstanceManager.get(oldId)).toBe(after);
    expect(backgroundElementTemplateInstanceManager.get(-1)).toBeUndefined();
  });
});
