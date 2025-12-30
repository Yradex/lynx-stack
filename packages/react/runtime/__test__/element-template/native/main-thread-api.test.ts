import { describe, expect, it } from 'vitest';

import { injectCalledByNative } from '../../../src/element-template/native/main-thread-api.js';

describe('injectCalledByNative', () => {
  it('should set getPageData returning null', () => {
    injectCalledByNative();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const globalAny = globalThis as any;
    expect(globalAny.getPageData).toBeDefined();
    expect(globalAny.getPageData()).toBeNull();

    expect(() => globalAny.updatePage()).not.toThrow();
    expect(() => globalAny.updateGlobalProps()).not.toThrow();
    expect(() => globalAny.removeComponents()).not.toThrow();
  });
});
