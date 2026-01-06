import { describe, expect, it } from 'vitest';

import { callDestroyLifetimeFun } from '../../../src/element-template/native/callDestroyLifetimeFun.js';

describe('callDestroyLifetimeFun', () => {
  it('does not throw', () => {
    expect(() => callDestroyLifetimeFun()).not.toThrow();
  });
});
