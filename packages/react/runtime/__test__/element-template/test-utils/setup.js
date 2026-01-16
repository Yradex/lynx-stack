// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { afterEach, beforeEach, expect } from 'vitest';

import { injectGlobals } from './debug/globals.js';
import { registerTemplates } from './debug/registry.ts';
import { installMockNativePapi } from './mock/mockNativePapi.ts';

globalThis.__REGISTER_ELEMENT_TEMPLATES__ = registerTemplates;

injectGlobals();
installMockNativePapi();

beforeEach(() => {
  // Reset global error collection for current test
  globalThis.__LYNX_REPORT_ERROR_CALLS = [];
  // Access performance via globalThis.lynx which is set in globals.js
  const performance = globalThis.lynx.performance;
  if (performance && performance.profileStart && performance.profileEnd) {
    performance.profileStart.mockClear();
    performance.profileEnd.mockClear();
  }
});

afterEach((context) => {
  const skippedTasks = [
    // Skip preact/debug tests since it would throw errors and abort the rendering process
    'preact/debug',
    'should remove event listener when throw in cleanup',
    'should not throw if error - instead it will render an empty page',
  ];
  if (skippedTasks.some(task => context.task.name.includes(task))) {
    return;
  }

  // check profile call times equal end call times
  expect(console.profile.mock.calls.length).toBe(
    console.profileEnd.mock.calls.length,
  );

  const performance = globalThis.lynx.performance;
  if (performance && performance.profileStart && performance.profileEnd) {
    expect(performance.profileStart.mock.calls.length).toBe(
      performance.profileEnd.mock.calls.length,
    );
  }

  const reportError = globalThis.lynx?.reportError;
  const globalErrors = globalThis.__LYNX_REPORT_ERROR_CALLS || [];
  const mockCalls = reportError?.mock?.calls || [];
  const totalCalls = mockCalls.length + globalErrors.length;
  if (totalCalls > 0) {
    const fromMock = mockCalls
      .map((args) =>
        args
          .map((arg) => arg instanceof Error ? (arg.stack || arg.message) : JSON.stringify(arg))
          .join(' ')
      )
      .join('\n');
    const fromGlobal = globalErrors
      .map((err) => (err && err.stack) ? err.stack : String(err))
      .join('\n');
    const details = [fromMock, fromGlobal].filter(Boolean).join('\n');

    throw new Error(
      `lynx.reportError was called ${totalCalls} times during test "${context.task.name}".\nDetails:\n${details}`,
    );
  }
});
