import { describe, expect, it, vi, afterEach } from 'vitest';
import { SnapshotInstance } from '../../src/element-template/internal.js';
import { injectCalledByNative } from '../../src/element-template/native/main-thread-api.js';
import { renderMainThread } from '../../src/element-template/runtime/render/render-main-thread.js';
import { __root } from '../../src/element-template/runtime/page/root-instance.js';

// Mock renderToOpcodes to control execution
vi.mock('../../src/renderToOpcodes/index.js', () => ({
  render: vi.fn(),
  registerSlot: vi.fn(),
}));

import { render as mockRender } from '../../src/renderToOpcodes/index.js';

describe('Coverage Supplement', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('SnapshotInstance should throw error on instantiation', () => {
    expect(() => new SnapshotInstance('div')).toThrowError(
      'SnapshotInstance should not be instantiated when using Element Template.',
    );
  });

  it('injectCalledByNative should set getPageData returning null', () => {
    injectCalledByNative();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const globalAny = globalThis as any;
    expect(globalAny.getPageData).toBeDefined();
    expect(globalAny.getPageData()).toBeNull();

    // Also cover updatePage/updateGlobalProps/removeComponents which are no-ops
    expect(() => globalAny.updatePage()).not.toThrow();
    expect(() => globalAny.updateGlobalProps()).not.toThrow();
    expect(() => globalAny.removeComponents()).not.toThrow();
  });

  it('renderMainThread should report error when renderToOpcodes fails', () => {
    const reportErrorSpy = vi.spyOn(lynx, 'reportError');

    // Simulate error
    vi.mocked(mockRender).mockImplementationOnce(() => {
      throw new Error('Render failed');
    });

    renderMainThread();

    expect(reportErrorSpy).toHaveBeenCalledWith(expect.objectContaining({ message: 'Render failed' }));
  });

  it('renderMainThread should run successfully', () => {
    // Simulate success
    vi.mocked(mockRender).mockReturnValue([]);

    expect(() => renderMainThread()).not.toThrow();
  });
});
