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
import { ElementTemplateOpcodes } from '../../../../src/element-template/protocol/opcodes.js';
import type { SerializedETInstance } from '../../../../src/element-template/protocol/types.js';
import { __page } from '../../../../src/element-template/runtime/page/page.js';
import { __root } from '../../../../src/element-template/runtime/page/root-instance.js';
import { applyElementTemplatePatches } from '../../../../src/element-template/runtime/patch.js';
import { ElementTemplateRegistry } from '../../../../src/element-template/runtime/template/registry.js';
import { ElementTemplateEnvManager } from '../../test-utils/envManager.js';
import { installMockNativePapi } from '../../test-utils/mockNativePapi.js';
import { registerTemplates } from '../../test-utils/registry.js';
import { serializeToJSX } from '../../test-utils/serializer.js';

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
  let cleanupNative: () => void;
  let onHydrate: (event: { data: unknown }) => void;
  let mockPatchElementTemplate: ReportErrorMock;
  let mockFlushElementTree: ReportErrorMock;

  beforeEach(() => {
    vi.clearAllMocks();
    const installed = installMockNativePapi({ clearTemplatesOnCleanup: false });
    cleanupNative = installed.cleanup;
    mockPatchElementTemplate = installed.mockPatchElementTemplate as unknown as ReportErrorMock;
    mockFlushElementTree = installed.mockFlushElementTree as unknown as ReportErrorMock;

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
    lynx.getCoreContext().removeEventListener(ElementTemplateLifecycleConstant.hydrate, onHydrate);
    resetElementTemplatePatchListener();
    cleanupNative();
    envManager.setUseElementTemplate(false);
  });

  function renderAndCollect(App: () => JSX.Element) {
    root.render(<App />);
    envManager.switchToMainThread();
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

  it('applies hydration patch stream and updates main thread tree', () => {
    function App() {
      const label = __BACKGROUND__ ? 'bg' : 'main';
      const A = <view key='a' id='a' />;
      const B = <view key='b' id='b' />;
      const T = <text key='t'>{__BACKGROUND__ ? 'BG' : 'Main'}</text>;
      const I = <image key='i' />;
      const children = __BACKGROUND__ ? [B, T, A, I] : [A, T, B];
      return <view id={label}>{children}</view>;
    }

    const { before, after } = renderAndCollect(App);
    const stream = hydrateBackground(before, after);

    expect(stream).toMatchInlineSnapshot(`
      [
        -5,
        [
          4,
          0,
          {
            "id": "bg",
          },
        ],
        -3,
        [
          3,
          0,
          -2,
        ],
        0,
        7,
        "raw-text",
        "BG",
        -3,
        [
          2,
          0,
          null,
          7,
        ],
        -5,
        [
          2,
          1,
          null,
          -3,
          2,
          1,
          null,
          -1,
        ],
        0,
        9,
        "_et_a94a8_test_4",
        [],
        null,
        -5,
        [
          2,
          1,
          null,
          9,
        ],
      ]
    `);

    envManager.switchToMainThread();
    const beforeJSX = serializeToJSX(__page);
    expect(beforeJSX).toMatchInlineSnapshot(`
      "<page>
        <view part-id="0" id="main">
          <view id="a" />
          <text>
            <raw-text text="Main" />
          </text>
          <view id="b" />
        </view>
      </page>"
    `);

    applyElementTemplatePatches(stream);

    const actualJSX = serializeToJSX(__page);
    expect(actualJSX).toMatchInlineSnapshot(`
      "<page>
        <view part-id="0" id="bg">
          <view id="b" />
          <text>
            <raw-text text="BG" />
          </text>
          <view id="a" />
          <image />
        </view>
      </page>"
    `);
  });

  it('applies insertBefore patches with non-null before reference', () => {
    function App() {
      const children = __BACKGROUND__
        ? [
          <view key='x' id='x' />,
          <view key='a' id='a' />,
          <view key='b' id='b' />,
        ]
        : [
          <view key='a' id='a' />,
          <view key='b' id='b' />,
        ];

      return <view>{children}</view>;
    }

    const { before, after } = renderAndCollect(App);
    const stream = hydrateBackground(before, after);

    envManager.switchToMainThread();
    applyElementTemplatePatches(stream);

    expect(serializeToJSX(__page)).toMatchInlineSnapshot(`
      "<page>
        <view>
          <view id="x" />
          <view id="a" />
          <view id="b" />
        </view>
      </page>"
    `);
  });

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

  it('detaches node from old slot when applying insertBefore into new slot', () => {
    root.render(<view />);
    envManager.switchToMainThread();
    renderPage();

    registerTemplates([
      {
        templateId: '_et_test_detach',
        compiledTemplate: {
          tag: '_et_test_detach',
          attributes: {},
          children: [
            { tag: 'slot', attributes: { 'part-id': 0 } },
            { tag: 'slot', attributes: { 'part-id': 1 } },
          ],
        },
      },
    ]);

    applyElementTemplatePatches([0, 20, '_et_test_detach', [], null]);
    const page = __page as unknown as { children?: unknown[] };
    page.children ??= [];
    page.children.push(ElementTemplateRegistry.get(20)!.nativeRef);

    applyElementTemplatePatches([
      0,
      10,
      'raw-text',
      'A',
      0,
      11,
      'raw-text',
      'B',
    ]);

    applyElementTemplatePatches([
      20,
      [
        ElementTemplateOpcodes.insertBefore,
        0,
        null,
        10,
        ElementTemplateOpcodes.insertBefore,
        0,
        null,
        11,
      ],
    ]);

    expect(serializeToJSX(__page)).toMatchInlineSnapshot(`
      "<page>
        <view />
        <_et_test_detach>
          <raw-text text="A" />
          <raw-text text="B" />

        </_et_test_detach>
      </page>"
    `);

    applyElementTemplatePatches([
      20,
      [
        ElementTemplateOpcodes.insertBefore,
        1,
        null,
        10,
      ],
    ]);

    expect(serializeToJSX(__page)).toMatchInlineSnapshot(`
      "<page>
        <view />
        <_et_test_detach>
          <raw-text text="B" />
          <raw-text text="A" />
        </_et_test_detach>
      </page>"
    `);
  });

  it('reports illegal handleId 0 on create', () => {
    root.render(<view />);
    envManager.switchToMainThread();
    renderPage();

    applyElementTemplatePatches([0, 0, 'raw-text', 'x']);

    const reportError = (globalThis.lynx as unknown as LynxWithReportErrorMock).reportError;
    expect(reportError.mock.calls).toHaveLength(1);
    resetReportedErrors();
  });

  it('reports missing patch target', () => {
    root.render(<view />);
    envManager.switchToMainThread();
    renderPage();

    applyElementTemplatePatches([999, [4, 0, { a: 1 }]]);

    const reportError = (globalThis.lynx as unknown as LynxWithReportErrorMock).reportError;
    expect(reportError.mock.calls).toHaveLength(1);
    resetReportedErrors();
  });

  it('reports missing handle when resolving references', () => {
    root.render(<view />);
    envManager.switchToMainThread();
    renderPage();

    applyElementTemplatePatches([-1, [2, 0, null, 999]]);

    const reportError = (globalThis.lynx as unknown as LynxWithReportErrorMock).reportError;
    expect(reportError.mock.calls).toHaveLength(1);
    resetReportedErrors();
  });

  it('creates raw-text with empty text when payload is not string', () => {
    root.render(<view />);
    envManager.switchToMainThread();
    renderPage();

    applyElementTemplatePatches([0, 1, 'raw-text', []]);

    expect(serializeToJSX(__page)).toMatchInlineSnapshot(`
      "<page>
        <view />
      </page>"
    `);
  });

  it('creates template with empty init opcodes when payload is not array', () => {
    root.render(<view />);
    envManager.switchToMainThread();
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
