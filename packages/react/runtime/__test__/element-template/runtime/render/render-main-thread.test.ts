import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderMainThread } from '../../../../src/element-template/runtime/render/render-main-thread.js';

vi.mock('../../../../src/renderToOpcodes/index.js', () => ({
  render: vi.fn(),
  registerSlot: vi.fn(),
}));

import { render as mockRender } from '../../../../src/renderToOpcodes/index.js';

describe('renderMainThread', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should report error when renderToOpcodes fails', () => {
    const reportErrorSpy = vi.fn();
    (globalThis.lynx as typeof lynx & { reportError?: (error: Error) => void }).reportError = reportErrorSpy;

    vi.mocked(mockRender).mockImplementationOnce(() => {
      throw new Error('Render failed');
    });

    renderMainThread();

    expect(reportErrorSpy).toHaveBeenCalledWith(expect.objectContaining({ message: 'Render failed' }));
  });

  it('should run successfully', () => {
    vi.mocked(mockRender).mockReturnValue([]);

    expect(() => renderMainThread()).not.toThrow();
  });
});
