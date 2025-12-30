// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { afterEach, beforeEach, expect } from 'vitest';

import './globals.js';

import { registerTemplates } from './registry.ts';

globalThis.__REGISTER_ELEMENT_TEMPLATES__ = registerTemplates;

beforeEach(() => {
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
});
