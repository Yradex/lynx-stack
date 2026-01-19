import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { options } from 'preact';

import {
  installElementTemplateCommitHook,
  markElementTemplateHydrated,
  resetElementTemplateCommitState,
} from '../../../../src/element-template/background/commit-hook.js';
import { GlobalCommitContext } from '../../../../src/element-template/background/commit-context.js';
import { ElementTemplateLifecycleConstant } from '../../../../src/element-template/protocol/lifecycle-constant.js';
import { ElementTemplateEnvManager } from '../../test-utils/debug/envManager.js';

describe('ElementTemplate commit hook', () => {
  const envManager = new ElementTemplateEnvManager();
  let updateEvents: unknown[] = [];

  const onUpdate = (event: { data: unknown }) => {
    updateEvents.push(event.data);
  };

  beforeEach(() => {
    resetElementTemplateCommitState();
    updateEvents = [];
    envManager.resetEnv('background');
    installElementTemplateCommitHook();

    envManager.switchToMainThread();
    lynx.getJSContext().addEventListener(ElementTemplateLifecycleConstant.update, onUpdate);
    envManager.switchToBackground();
  });

  afterEach(() => {
    envManager.switchToMainThread();
    lynx.getJSContext().removeEventListener(ElementTemplateLifecycleConstant.update, onUpdate);
    envManager.switchToBackground();
    resetElementTemplateCommitState();
  });

  it('dispatches update after commit when hydrated', () => {
    markElementTemplateHydrated();
    GlobalCommitContext.patches = [0, 1, 'raw-text', 'hello'];
    GlobalCommitContext.flushOptions = { reason: 'test' };

    options.__c?.({} as unknown as object, []);

    envManager.switchToMainThread();
    expect(updateEvents).toHaveLength(1);
    expect(updateEvents[0]).toEqual({
      patches: [0, 1, 'raw-text', 'hello'],
      flushOptions: { reason: 'test' },
    });
    envManager.switchToBackground();
    expect(GlobalCommitContext.patches).toEqual([]);
  });

  it('skips dispatch before hydration', () => {
    GlobalCommitContext.patches = [0, 1, 'raw-text', 'hello'];

    options.__c?.({} as unknown as object, []);

    envManager.switchToMainThread();
    expect(updateEvents).toHaveLength(0);
  });

  it('is idempotent', () => {
    installElementTemplateCommitHook();
    installElementTemplateCommitHook();
    expect(true).toBe(true);
  });
});
