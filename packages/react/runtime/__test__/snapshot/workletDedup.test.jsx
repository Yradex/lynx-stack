/*
// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
*/
import { render } from 'preact';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackgroundSnapshotInstance, hydrate } from '../../src/backgroundSnapshot';
import { useState } from '../../src/index';
import { replaceCommitHook } from '../../src/lifecycle/patch/commit';
import {
  SnapshotOperation,
  deinitGlobalSnapshotPatch,
  initGlobalSnapshotPatch,
  takeGlobalSnapshotPatch,
} from '../../src/lifecycle/patch/snapshotPatch';
import { injectUpdateMainThread } from '../../src/lifecycle/patch/updateMainThread';
import { __root } from '../../src/root';
import { updateWorkletEvent as updateMtfEvent } from '../../src/snapshot/workletEvent';
import { updateWorkletRef as updateMtfRef } from '../../src/snapshot/workletRef';
import { createSnapshot, setupPage } from '../../src/snapshot';
import { clearMtfTableForPatch, resolveMtfFromPatch, setMtfTableForPatch } from '../../src/worklet/patchWorkletTable';
import { clearConfigCacheForTesting } from '../../src/worklet/functionality';
import { globalEnvManager } from '../utils/envManager';
import { elementTree, waitSchedule } from '../utils/nativeMethod';

beforeAll(() => {
  setupPage(__CreatePage('0', 0));
  injectUpdateMainThread();
  replaceCommitHook();
});

beforeEach(() => {
  globalEnvManager.resetEnv();
  SystemInfo.lynxSdkVersion = '999.999';
  clearConfigCacheForTesting();
});

afterEach(() => {
  vi.restoreAllMocks();
  clearMtfTableForPatch();
  elementTree.clear();
});

describe('MTFDedup', () => {
  it('should emit null when MTS is disabled for MTF values', () => {
    SystemInfo.lynxSdkVersion = '2.13';
    clearConfigCacheForTesting();

    const snapshotType = createSnapshot('mtf_dedup_test_0', null, null, [], undefined, undefined, null);

    initGlobalSnapshotPatch();
    const bsi = new BackgroundSnapshotInstance(snapshotType);
    bsi.setAttribute('values', [
      {
        _wkltId: 'mts0',
      },
    ]);
    const patch = takeGlobalSnapshotPatch();
    deinitGlobalSnapshotPatch();

    expect(patch).toEqual([
      SnapshotOperation.CreateElement,
      snapshotType,
      bsi.__id,
      SnapshotOperation.SetAttributes,
      bsi.__id,
      [null],
    ]);
  });

  it('resolveMtfFromPatch should throw without mtfTable', () => {
    clearMtfTableForPatch();
    expect(() => resolveMtfFromPatch({ $mtfRef: 0 })).toThrowError('MTF table is not available.');
  });

  it('resolveMtfFromPatch should throw for invalid $mtfRef index', () => {
    setMtfTableForPatch([
      {
        _wkltId: 'mts0',
      },
    ]);
    expect(() => resolveMtfFromPatch({ $mtfRef: 1 })).toThrowError('Invalid $mtfRef index: 1');
  });

  it('hydrate should convert MTF to null when MTS is disabled', () => {
    SystemInfo.lynxSdkVersion = '2.13';
    clearConfigCacheForTesting();

    const snapshotType = createSnapshot('mtf_hydrate_test_0', null, null, [], undefined, undefined, null);
    const after = new BackgroundSnapshotInstance(snapshotType);
    after.__values = [{ _wkltId: 'mts0' }];

    const patch = hydrate(
      {
        id: after.__id,
        type: snapshotType,
        values: [1],
        children: [],
      },
      after,
    );

    expect(patch).toContain(SnapshotOperation.SetAttribute);
    expect(patch).toContain(null);
  });

  it('hydrate should convert spread MTF to null when MTS is disabled', () => {
    SystemInfo.lynxSdkVersion = '2.13';
    clearConfigCacheForTesting();

    const snapshotType = createSnapshot('mtf_hydrate_test_1', null, null, [], undefined, undefined, null);
    const after = new BackgroundSnapshotInstance(snapshotType);
    after.__values = [
      {
        __spread: true,
        'main-thread:bindtap': { _wkltId: 'mts0' },
      },
    ];

    const patch = hydrate(
      {
        id: after.__id,
        type: snapshotType,
        values: [1],
        children: [],
      },
      after,
    );

    expect(patch).toContain(SnapshotOperation.SetAttribute);
    const i = patch.indexOf(SnapshotOperation.SetAttribute);
    expect(patch[i + 3]['main-thread:bindtap']).toBe(null);
  });

  it('should dedup nested MTF captures in patch payload', async () => {
    const big = `__BIG__${'X'.repeat(256)}__BIG__`;

    const mts3 = {
      _wkltId: 'mts3',
      _c: {
        big,
      },
    };
    const mts0 = {
      _wkltId: 'mts0',
      _c: {
        mts3,
      },
    };
    const mts1 = {
      _wkltId: 'mts1',
      _c: {
        mts3,
      },
    };

    let setH0;
    let setH1;
    function Comp() {
      const [h0, _setH0] = useState(undefined);
      const [h1, _setH1] = useState(undefined);
      setH0 = _setH0;
      setH1 = _setH1;
      return (
        <view>
          <text main-thread:bindtap={h0}>0</text>
          <text main-thread:bindtap={h1}>1</text>
        </view>
      );
    }

    {
      __root.__jsx = <Comp />;
      renderPage();
    }

    {
      globalEnvManager.switchToBackground();
      render(<Comp />, __root);
    }

    {
      lynxCoreInject.tt.OnLifecycleEvent(...globalThis.__OnLifecycleEvent.mock.calls[0]);

      globalEnvManager.switchToMainThread();
      const rLynxChange = lynx.getNativeApp().callLepusMethod.mock.calls[0];
      globalThis[rLynxChange[0]](rLynxChange[1]);
    }

    {
      globalEnvManager.switchToBackground();
      lynx.getNativeApp().callLepusMethod.mockClear();

      setH0(mts0);
      setH1(mts1);
      await waitSchedule();

      const rLynxChange = lynx.getNativeApp().callLepusMethod.mock.calls[0];
      const obj = rLynxChange[1];

      expect(obj.data.includes('"mtfTable"')).toBe(true);
      expect(obj.data.includes('"$mtfRef"')).toBe(true);
      expect(obj.data.split(big).length - 1).toBe(1);

      const parsed = JSON.parse(obj.data);
      expect(Array.isArray(parsed.mtfTable)).toBe(true);
      expect(parsed.mtfTable.map((x) => x._wkltId).sort()).toEqual(['mts0', 'mts1', 'mts3'].sort());

      globalEnvManager.switchToMainThread();
      globalThis[rLynxChange[0]](obj);

      const page = __root.__element_root;
      const view = page.children[0];
      const text0 = view.children[0];
      const text1 = view.children[1];
      expect(text0.props.event['bindEvent:tap'].value._wkltId).toBe('mts0');
      expect(text1.props.event['bindEvent:tap'].value._wkltId).toBe('mts1');
    }
  });
});
