import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { options } from 'preact';

import { GlobalCommitContext } from '../../../src/element-template/background/commit-context.js';
import {
  beginPipeline,
  initTimingAPI,
  markTiming,
  markTimingLegacy,
  PerformanceTimingFlags,
  PipelineOrigins,
  setPipeline,
} from '../../../src/element-template/lynx/performance.js';
import { RENDER_COMPONENT } from '../../../src/renderToOpcodes/constants.js';
import { ElementTemplateEnvManager } from '../test-utils/debug/envManager.js';

const envManager = new ElementTemplateEnvManager();

describe('ElementTemplate performance timing', () => {
  const originalSystemInfo = globalThis.SystemInfo as unknown;
  let nativeMarkTiming: ReturnType<typeof vi.fn>;
  let originalLynx: unknown;

  beforeEach(() => {
    envManager.resetEnv('background');

    globalThis.SystemInfo = { lynxSdkVersion: '3.1' } as typeof SystemInfo;

    nativeMarkTiming = vi.fn();
    originalLynx = globalThis.lynx;
    globalThis.lynx = {
      ...(originalLynx as object),
      getNativeApp: () => ({ markTiming: nativeMarkTiming }),
    } as typeof lynx;

    globalThis.lynx.performance.__functionCallHistory = [];
    globalThis.lynx.performance._markTiming.mockClear();
    globalThis.lynx.performance._onPipelineStart.mockClear();
    globalThis.lynx.performance._bindPipelineIdWithTimingFlag.mockClear();
  });

  afterEach(() => {
    setPipeline(undefined);
    GlobalCommitContext.patches = [];
    globalThis.SystemInfo = originalSystemInfo as typeof SystemInfo;
    globalThis.lynx = originalLynx as typeof lynx;
  });

  it('beginPipeline wires pipeline options and markTiming respects needTimestamps', () => {
    beginPipeline(true, PipelineOrigins.reactLynxHydrate, PerformanceTimingFlags.reactLynxHydrate);

    const onStartCalls = globalThis.lynx.performance._onPipelineStart.mock.calls;
    expect(onStartCalls).toHaveLength(1);
    expect(onStartCalls[0]?.[0]).toBe('pipelineID');
    expect(onStartCalls[0]?.[1]).toMatchObject({
      pipelineID: 'pipelineID',
      needTimestamps: true,
      pipelineOrigin: PipelineOrigins.reactLynxHydrate,
      dsl: 'reactLynx',
      stage: 'hydrate',
    });

    const bindCalls = globalThis.lynx.performance._bindPipelineIdWithTimingFlag.mock.calls;
    expect(bindCalls).toHaveLength(1);
    expect(bindCalls[0]).toEqual(['pipelineID', PerformanceTimingFlags.reactLynxHydrate]);

    markTiming('diffVdomStart');
    expect(globalThis.lynx.performance._markTiming.mock.calls).toEqual([
      ['pipelineID', 'diffVdomStart'],
    ]);
  });

  it('beginPipeline uses legacy signature on older SDKs', () => {
    globalThis.SystemInfo = { lynxSdkVersion: '3.0' } as typeof SystemInfo;

    beginPipeline(true, PipelineOrigins.reactLynxHydrate);

    const onStartCalls = globalThis.lynx.performance._onPipelineStart.mock.calls;
    expect(onStartCalls).toHaveLength(1);
    expect(onStartCalls[0]).toEqual(['pipelineID']);
  });

  it('markTiming only emits when needTimestamps is true or forced', () => {
    beginPipeline(false, PipelineOrigins.updateTriggeredByBts);

    markTiming('diffVdomStart');
    expect(globalThis.lynx.performance._markTiming).not.toHaveBeenCalled();

    markTiming('diffVdomStart', true);
    expect(globalThis.lynx.performance._markTiming).toHaveBeenCalledWith(
      'pipelineID',
      'diffVdomStart',
    );
  });

  it('markTimingLegacy follows update timing flag flow', () => {
    markTimingLegacy('updateSetStateTrigger', 'flag');
    expect(nativeMarkTiming).toHaveBeenCalledWith('flag', 'updateSetStateTrigger');

    markTimingLegacy('updateDiffVdomStart');
    markTimingLegacy('updateDiffVdomEnd');

    expect(nativeMarkTiming.mock.calls).toEqual([
      ['flag', 'updateSetStateTrigger'],
      ['flag', 'updateDiffVdomStart'],
      ['flag', 'updateDiffVdomEnd'],
    ]);
  });

  it('markTimingLegacy ignores diff end without trigger', () => {
    markTimingLegacy('updateDiffVdomEnd');
    expect(nativeMarkTiming).not.toHaveBeenCalled();
  });

  it('markTimingLegacy ignores diff start without trigger', () => {
    markTimingLegacy('updateDiffVdomStart');
    expect(nativeMarkTiming).not.toHaveBeenCalled();
  });

  it('initTimingAPI hooks diff timing when updates are detected', () => {
    initTimingAPI();

    GlobalCommitContext.patches = [0, 1, 'raw-text', 'payload'];
    options[RENDER_COMPONENT]?.({} as unknown as object, null);

    expect(globalThis.lynx.performance._markTiming).toHaveBeenCalledWith(
      'pipelineID',
      'diffVdomStart',
    );
  });

  it('initTimingAPI triggers legacy diff start on ROOT hook', () => {
    initTimingAPI();

    markTimingLegacy('updateSetStateTrigger', 'flag');
    GlobalCommitContext.patches = [0, 1, 'raw-text', 'payload'];

    options.__?.({} as unknown as object, null);

    expect(nativeMarkTiming.mock.calls).toEqual([
      ['flag', 'updateSetStateTrigger'],
      ['flag', 'updateDiffVdomStart'],
    ]);
  });
});
