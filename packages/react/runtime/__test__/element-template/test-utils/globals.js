// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { vi } from 'vitest';

const performance = {
  __functionCallHistory: [],
  _generatePipelineOptions: vi.fn(() => {
    performance.__functionCallHistory.push(['_generatePipelineOptions']);
    return {
      pipelineID: 'pipelineID',
      needTimestamps: false,
    };
  }),
  _onPipelineStart: vi.fn((id, options) => {
    if (typeof options === 'undefined') {
      performance.__functionCallHistory.push(['_onPipelineStart', id]);
    } else {
      performance.__functionCallHistory.push(['_onPipelineStart', id, options]);
    }
  }),
  _markTiming: vi.fn((id, key) => {
    performance.__functionCallHistory.push(['_markTiming', id, key]);
  }),
  _bindPipelineIdWithTimingFlag: vi.fn((id, flag) => {
    performance.__functionCallHistory.push(['_bindPipelineIdWithTimingFlag', id, flag]);
  }),

  profileStart: vi.fn(),
  profileEnd: vi.fn(),
  profileMark: vi.fn(),
  profileFlowId: vi.fn(() => 666),
  isProfileRecording: vi.fn(() => true),
};

function injectGlobals() {
  globalThis.__DEV__ = true;
  globalThis.__PROFILE__ = true;
  globalThis.__ALOG__ = true;
  globalThis.__JS__ = true;
  globalThis.__LEPUS__ = true;
  globalThis.__BACKGROUND__ = true;
  globalThis.__MAIN_THREAD__ = true;
  globalThis.__REF_FIRE_IMMEDIATELY__ = false;
  globalThis.__ENABLE_SSR__ = true;
  globalThis.__USE_ELEMENT_TEMPLATE__ = false;
  globalThis.__FIRST_SCREEN_SYNC_TIMING__ = 'immediately';
  globalThis.globDynamicComponentEntry = '__Card__';
  globalThis.lynxCoreInject = {};
  globalThis.lynxCoreInject.tt = {};
  globalThis.lynx = {
    performance,
  };
  globalThis.requestAnimationFrame = setTimeout;
  globalThis.cancelAnimationFrame = clearTimeout;

  globalThis.__OnLifecycleEvent = vi.fn();
  globalThis._ReportError = vi.fn();

  globalThis.__SNAPSHOT__ = (snapshot) => {
    return snapshot.type;
  };

  console.profile = vi.fn();
  console.profileEnd = vi.fn();
  console.alog = vi.fn();
}

injectGlobals();
