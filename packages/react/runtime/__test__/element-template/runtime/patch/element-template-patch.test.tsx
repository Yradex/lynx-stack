// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hydrate as hydrateBackground } from '../../../../src/element-template/background/hydrate.js';
import type { BackgroundElementTemplateInstance } from '../../../../src/element-template/background/instance.js';
import { root } from '../../../../src/element-template/index.js';
import {
  installElementTemplatePatchListener,
  resetElementTemplatePatchListener,
} from '../../../../src/element-template/native/patch-listener.js';
import { ElementTemplateLifecycleConstant } from '../../../../src/element-template/protocol/lifecycle-constant.js';
import type { SerializedETInstance } from '../../../../src/element-template/protocol/types.js';
import { __page } from '../../../../src/element-template/runtime/page/page.js';
import { __root } from '../../../../src/element-template/runtime/page/root-instance.js';
import { applyElementTemplatePatches } from '../../../../src/element-template/runtime/patch.js';
import { ElementTemplateEnvManager } from '../../test-utils/debug/envManager.js';
import { lastMock } from '../../test-utils/mock/mockNativePapi.js';
import { serializeToJSX } from '../../test-utils/debug/serializer.js';

declare const renderPage: () => void;

interface RootWithFirstChild {
  firstChild: BackgroundElementTemplateInstance | null;
}
interface ReportErrorMock {
  mock: { calls: unknown[][] };
  mockClear: () => void;
}
interface LynxWithReportErrorMock {
  reportError: ReportErrorMock;
}
interface PageWithChildren {
  children?: Array<{ templateId?: string }>;
}

function resetReportedErrors(): void {
  const lynxObj = globalThis.lynx as unknown as LynxWithReportErrorMock;
  lynxObj.reportError.mockClear();
  (globalThis as unknown as { __LYNX_REPORT_ERROR_CALLS: Error[] }).__LYNX_REPORT_ERROR_CALLS = [];
}

describe('ElementTemplate patch stream (apply)', () => {
  const envManager = new ElementTemplateEnvManager();
  let hydrationData: SerializedETInstance[] = [];

  let onHydrate: (event: { data: unknown }) => void;
  let mockPatchElementTemplate: ReportErrorMock;
  let mockFlushElementTree: ReportErrorMock;

  beforeEach(() => {
    vi.clearAllMocks();
    // mocks are already installed by setup.js beforeEach
    mockPatchElementTemplate = lastMock!.mockPatchElementTemplate as unknown as ReportErrorMock;
    mockFlushElementTree = lastMock!.mockFlushElementTree as unknown as ReportErrorMock;

    hydrationData = [];
    envManager.resetEnv('background');
    envManager.setUseElementTemplate(true);

    onHydrate = vi.fn().mockImplementation((event: { data: unknown }) => {
      const data = event.data;
      if (Array.isArray(data)) {
        for (const item of data) {
          hydrationData.push(item as SerializedETInstance);
        }
      }
    });
    lynx.getCoreContext().addEventListener(ElementTemplateLifecycleConstant.hydrate, onHydrate);
  });

  afterEach(() => {
    envManager.switchToBackground();
    lynx.getCoreContext().removeEventListener(ElementTemplateLifecycleConstant.hydrate, onHydrate);

    envManager.switchToMainThread();
    resetElementTemplatePatchListener();

    envManager.setUseElementTemplate(false);
  });

  function renderAndCollect(App: () => JSX.Element) {
    const jsx = <App />;
    root.render(jsx);
    envManager.switchToMainThread();
    root.render(jsx);
    renderPage();
    envManager.switchToBackground();

    const before = hydrationData[0]!;
    const backgroundRoot = __root as unknown as RootWithFirstChild;
    const after = backgroundRoot.firstChild;
    if (!after) {
      throw new Error('Missing background root child');
    }

    return { before, after };
  }

  it('resolves non-null beforeId references when applying patches', () => {
    function App() {
      return (
        <view>
          <view key='a' id='a' />
          <view key='b' id='b' />
        </view>
      );
    }

    const { before } = renderAndCollect(App);
    envManager.switchToMainThread();

    const beforeJSX = serializeToJSX(__page);
    applyElementTemplatePatches([
      before[0],
      [2, 9999, before[0], before[0]],
    ]);

    expect(serializeToJSX(__page)).toBe(beforeJSX);
  });

  it('accepts commit context payload on update event', () => {
    function App() {
      const id = __BACKGROUND__ ? 'bg' : 'main';
      return <view id={id} />;
    }

    const { before, after } = renderAndCollect(App);
    const stream = hydrateBackground(before, after);
    expect(stream.length).toBeGreaterThan(0);

    envManager.switchToMainThread();
    installElementTemplatePatchListener();
    mockPatchElementTemplate.mockClear();
    mockFlushElementTree.mockClear();

    envManager.switchToBackground();
    lynx.getCoreContext().dispatchEvent({
      type: ElementTemplateLifecycleConstant.update,
      data: { patches: stream, flushOptions: {} },
    });
    envManager.switchToMainThread();

    expect(mockPatchElementTemplate.mock.calls.length).toBeGreaterThan(0);
    expect(mockFlushElementTree.mock.calls.length).toBeGreaterThan(0);
  });

  it('profiles patch update flowIds on main thread without passing them to __FlushElementTree', () => {
    function App() {
      const id = __BACKGROUND__ ? 'bg' : 'main';
      return <view id={id} />;
    }

    const { before, after } = renderAndCollect(App);
    const stream = hydrateBackground(before, after);
    expect(stream.length).toBeGreaterThan(0);

    envManager.switchToMainThread();
    installElementTemplatePatchListener();
    const performance = lynx.performance;
    performance.profileStart.mockClear();
    performance.profileEnd.mockClear();
    mockFlushElementTree.mockClear();

    envManager.switchToBackground();
    lynx.getCoreContext().dispatchEvent({
      type: ElementTemplateLifecycleConstant.update,
      data: { patches: stream, flushOptions: {}, flowIds: [101, 202] },
    });
    envManager.switchToMainThread();

    expect(performance.profileStart).toHaveBeenCalledWith('ReactLynx::patch', {
      flowId: 101,
      flowIds: [101, 202],
    });
    expect(performance.profileEnd).toHaveBeenCalledTimes(1);
    const lastFlushOptions = mockFlushElementTree.mock.calls.at(-1)?.[1] as { flowIds?: unknown };
    expect(lastFlushOptions.flowIds).toBeUndefined();
  });

  it('reports illegal handleId 0 on create', () => {
    const jsx = <view />;
    root.render(jsx);
    envManager.switchToMainThread();
    root.render(jsx);
    renderPage();

    applyElementTemplatePatches([0, 0, 'raw-text', 'x']);

    const reportError = (globalThis.lynx as unknown as LynxWithReportErrorMock).reportError;
    expect(reportError.mock.calls).toHaveLength(1);
    resetReportedErrors();
  });

  it('reports missing patch target', () => {
    const jsx = <view />;
    root.render(jsx);
    envManager.switchToMainThread();
    root.render(jsx);
    renderPage();

    applyElementTemplatePatches([999, [4, 0, { a: 1 }]]);

    const reportError = (globalThis.lynx as unknown as LynxWithReportErrorMock).reportError;
    expect(reportError.mock.calls).toHaveLength(1);
    resetReportedErrors();
  });

  it('reports missing handle when resolving references', () => {
    const jsx = <view />;
    root.render(jsx);
    envManager.switchToMainThread();
    root.render(jsx);
    renderPage();

    applyElementTemplatePatches([-1, [2, 0, null, 999]]);

    const reportError = (globalThis.lynx as unknown as LynxWithReportErrorMock).reportError;
    expect(reportError.mock.calls).toHaveLength(1);
    resetReportedErrors();
  });

  it('creates raw-text with empty text when payload is not string', () => {
    const jsx = <view />;
    root.render(jsx);
    envManager.switchToMainThread();
    root.render(jsx);
    renderPage();

    applyElementTemplatePatches([0, 1, 'raw-text', []]);

    expect(serializeToJSX(__page)).toMatchInlineSnapshot(`
      "<page>
        <view />
      </page>"
    `);
  });

  it('creates template with empty init opcodes when payload is not array', () => {
    const jsx = <view />;
    root.render(jsx);
    envManager.switchToMainThread();
    root.render(jsx);
    renderPage();

    const templateKey = (__page as unknown as PageWithChildren).children?.[0]?.templateId;
    if (!templateKey) {
      throw new Error('Missing templateId on first page child');
    }
    applyElementTemplatePatches([0, 7, templateKey, 'not-an-array']);

    expect(serializeToJSX(__page)).toMatchInlineSnapshot(`
      "<page>
        <view />
      </page>"
    `);
  });
});
