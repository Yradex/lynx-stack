import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  installElementTemplatePatchListener,
  resetElementTemplatePatchListener,
} from '../../../../src/element-template/native/patch-listener.js';
import { setPipeline } from '../../../../src/element-template/lynx/performance.js';
import { ElementTemplateLifecycleConstant } from '../../../../src/element-template/protocol/lifecycle-constant.js';
import { ElementTemplateEnvManager } from '../../test-utils/debug/envManager.js';

const pipelineOptions = {
  pipelineID: 'pipelineID',
  needTimestamps: true,
} as const;

describe('ElementTemplate update timing (main thread patch)', () => {
  const envManager = new ElementTemplateEnvManager();

  beforeEach(() => {
    envManager.resetEnv('main');
    installElementTemplatePatchListener();
    lynx.performance._markTiming.mockClear();
    (__FlushElementTree as unknown as { mockClear: () => void }).mockClear();
  });

  afterEach(() => {
    resetElementTemplatePatchListener();
    setPipeline(undefined);
  });

  it('marks parse/patch timings using pipeline options', () => {
    const payload = {
      patches: [0, 1, 'raw-text', 'hello'],
      flushOptions: { pipelineOptions },
    };

    envManager.switchToBackground(() => {
      lynx.getCoreContext().dispatchEvent({
        type: ElementTemplateLifecycleConstant.update,
        data: payload,
      });
    });
    envManager.switchToMainThread();

    const flushCalls = (__FlushElementTree as unknown as { mock: { calls: unknown[][] } }).mock
      .calls;
    expect(flushCalls.length).toBeGreaterThan(0);
    expect(flushCalls[0]?.[1]).toMatchObject({ pipelineOptions });

    expect(lynx.performance._markTiming.mock.calls).toEqual([
      ['pipelineID', 'mtsRenderStart'],
      ['pipelineID', 'parseChangesStart'],
      ['pipelineID', 'parseChangesEnd'],
      ['pipelineID', 'patchChangesStart'],
      ['pipelineID', 'patchChangesEnd'],
      ['pipelineID', 'mtsRenderEnd'],
    ]);
  });

  it('handles updates without flush options', () => {
    const payload = {
      patches: [0, 1, 'raw-text', 'hello'],
    };

    envManager.switchToBackground(() => {
      lynx.getCoreContext().dispatchEvent({
        type: ElementTemplateLifecycleConstant.update,
        data: payload,
      });
    });
    envManager.switchToMainThread();

    const flushCalls = (__FlushElementTree as unknown as { mock: { calls: unknown[][] } }).mock
      .calls;
    expect(flushCalls.length).toBeGreaterThan(0);
  });
});
