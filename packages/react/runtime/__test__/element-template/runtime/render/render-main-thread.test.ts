import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderMainThread } from '../../../../src/element-template/runtime/render/render-main-thread.js';
import { setupPage } from '../../../../src/element-template/runtime/page/page.js';
import { setRoot } from '../../../../src/element-template/runtime/page/root-instance.js';

vi.mock('../../../../src/renderToOpcodes/index.js', () => ({
  render: vi.fn(),
  registerSlot: vi.fn(),
}));

vi.mock('../../../../src/element-template/runtime/render/render-opcodes.js', () => ({
  renderOpcodesIntoElementTemplate: vi.fn(),
}));

import { render as mockRender } from '../../../../src/renderToOpcodes/index.js';
import { renderOpcodesIntoElementTemplate as mockRenderOpcodesIntoElementTemplate } from '../../../../src/element-template/runtime/render/render-opcodes.js';

describe('renderMainThread', () => {
  beforeEach(() => {
    setRoot({ __jsx: { type: 'test-root' } });
    setupPage({ type: 'page', children: [] } as unknown as FiberElement);
    globalThis.__MAIN_THREAD__ = true;
    globalThis.__BACKGROUND__ = false;
    globalThis.lynx = {
      ...(globalThis.lynx ?? {}),
      reportError: vi.fn(),
      getCoreContext: vi.fn(() => ({
        dispatchEvent: vi.fn(),
      })),
    } as typeof lynx;
    vi.stubGlobal('__AppendElement', vi.fn());
    vi.mocked(mockRenderOpcodesIntoElementTemplate).mockReturnValue({ rootRefs: [] });
  });

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

  it('should render opcodes into the current page without dispatching hydrate', () => {
    const opcodes = [0, 'opcode'];
    const rootRefA = { type: 'ref-a' } as unknown as ElementRef;
    const rootRefB = { type: 'ref-b' } as unknown as ElementRef;
    const dispatchEvent = vi.fn();
    vi.mocked(mockRender).mockReturnValue(opcodes);
    vi.mocked(mockRenderOpcodesIntoElementTemplate).mockReturnValue({
      rootRefs: [rootRefA, rootRefB],
    });
    (globalThis.lynx as typeof lynx & { getCoreContext?: () => { dispatchEvent: typeof dispatchEvent } })
      .getCoreContext = vi.fn(() => ({
        dispatchEvent,
      }));

    expect(() => renderMainThread()).not.toThrow();
    expect(mockRender).toHaveBeenCalledWith({ type: 'test-root' }, undefined);
    expect(mockRenderOpcodesIntoElementTemplate).toHaveBeenCalledWith(
      opcodes,
    );
    expect(__AppendElement).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: 'page' }), rootRefA);
    expect(__AppendElement).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: 'page' }), rootRefB);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
});
