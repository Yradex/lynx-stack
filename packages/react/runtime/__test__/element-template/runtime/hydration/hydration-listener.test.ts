import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  installElementTemplateHydrationListener,
  resetElementTemplateHydrationListener,
} from '../../../../src/element-template/background/hydration-listener.js';
import { BackgroundElementTemplateInstance } from '../../../../src/element-template/background/instance.js';
import { backgroundElementTemplateInstanceManager } from '../../../../src/element-template/background/manager.js';
import {
  PerformanceTimingFlags,
  PipelineOrigins,
} from '../../../../src/element-template/lynx/performance.js';
import { ElementTemplateLifecycleConstant } from '../../../../src/element-template/protocol/lifecycle-constant.js';
import type { SerializedETInstance } from '../../../../src/element-template/protocol/types.js';
import { __root } from '../../../../src/element-template/runtime/page/root-instance.js';
import { ElementTemplateEnvManager } from '../../test-utils/debug/envManager.js';
import { flushCoreContextEvents } from '../../test-utils/mock/mockNativePapi/context.js';
// removed installMockNativePapi import

import '../../../../src/element-template/native/index.js';

interface LynxMock {
  getJSContext(): { dispatchEvent(event: { type: string; data: unknown }): number };
}

interface TTMock {
  callDestroyLifetimeFun?: () => void;
}

describe('ElementTemplate hydration listener', () => {
  const envManager = new ElementTemplateEnvManager();

  beforeEach(() => {
    vi.clearAllMocks();
    resetElementTemplateHydrationListener();
    envManager.resetEnv('background');
  });

  afterEach(() => {
    resetElementTemplateHydrationListener();
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

  it('marks hydrate performance timings on background thread', () => {
    envManager.switchToBackground();
    installElementTemplateHydrationListener();

    const backgroundRoot = __root as BackgroundElementTemplateInstance;
    const after = new BackgroundElementTemplateInstance('_et_test');
    backgroundRoot.appendChild(after);

    envManager.switchToMainThread();
    const instances: SerializedETInstance[] = [[-1, '_et_test', {}, {}]];
    lynx.getJSContext().dispatchEvent({
      type: ElementTemplateLifecycleConstant.hydrate,
      data: instances,
    });

    envManager.switchToBackground();

    const { performance } = lynx;
    expect(performance.profileStart).toHaveBeenCalledWith('ReactLynx::hydrate');
    expect(performance.profileEnd).toHaveBeenCalledTimes(1);

    const onStartCalls = performance._onPipelineStart.mock.calls;
    expect(onStartCalls).toHaveLength(1);
    expect(onStartCalls[0]?.[0]).toBe('pipelineID');
    expect(onStartCalls[0]?.[1]).toMatchObject({
      pipelineID: 'pipelineID',
      needTimestamps: true,
      pipelineOrigin: PipelineOrigins.reactLynxHydrate,
      dsl: 'reactLynx',
      stage: 'hydrate',
    });

    const bindCalls = performance._bindPipelineIdWithTimingFlag.mock.calls;
    expect(bindCalls).toHaveLength(1);
    expect(bindCalls[0]).toEqual(['pipelineID', PerformanceTimingFlags.reactLynxHydrate]);

    expect(performance._markTiming.mock.calls).toEqual([
      ['pipelineID', 'hydrateParseSnapshotStart'],
      ['pipelineID', 'hydrateParseSnapshotEnd'],
      ['pipelineID', 'diffVdomStart'],
      ['pipelineID', 'diffVdomEnd'],
    ]);
  });
});
