// Copyright 2025 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hydrate as hydrateBackground } from '../../../../src/element-template/background/hydrate.js';
import {
  BackgroundElementTemplateInstance,
  BackgroundElementTemplateSlot,
  BackgroundElementTemplateText,
} from '../../../../src/element-template/background/instance.js';
import { backgroundElementTemplateInstanceManager } from '../../../../src/element-template/background/manager.js';
import { root } from '../../../../src/element-template/index.js';
import type { SerializedETInstance } from '../../../../src/element-template/runtime/hydration.js';
import { ElementTemplateLifecycleConstant } from '../../../../src/element-template/runtime/lifecycle-constant.js';
import { __root } from '../../../../src/element-template/runtime/page/root-instance.js';
import { ElementTemplateEnvManager } from '../../test-utils/envManager.js';
import { installMockNativePapi } from '../../test-utils/mockNativePapi.js';
import { clearTemplates } from '../../test-utils/registry.js';

declare const renderPage: () => void;

declare module '@lynx-js/types' {
  interface IntrinsicElements {
    child: any;
  }
}

describe('ElementTemplate background hydrate', () => {
  let hydrationData: SerializedETInstance[] = [];
  let cleanupNative: () => void;
  const envManager = new ElementTemplateEnvManager();

  afterAll(() => {
    clearTemplates();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    installMockNativePapi();
    cleanupNative = () => {
      vi.unstubAllGlobals();
    };
    hydrationData = [];
    envManager.resetEnv('background');
    envManager.setUseElementTemplate(true);

    const mockOnLifecycleEvent = vi.fn().mockImplementation((args: unknown[]) => {
      const [event, data] = args as [unknown, unknown];
      if (event === ElementTemplateLifecycleConstant.hydrate && Array.isArray(data)) {
        hydrationData.push(...(data as SerializedETInstance[]));
      }
    });
    vi.stubGlobal('__OnLifecycleEvent', mockOnLifecycleEvent);
  });

  function renderAndCollect(App: () => JSX.Element) {
    root.render(<App />);
    envManager.switchToMainThread();
    renderPage();
    envManager.switchToBackground();

    const before = hydrationData[0]!;
    const backgroundRoot = __root as BackgroundElementTemplateInstance;
    const after = backgroundRoot.firstChild!;

    return { before, after };
  }

  it('reports key mismatch in dev and returns without updating ids', () => {
    backgroundElementTemplateInstanceManager.clear();
    backgroundElementTemplateInstanceManager.nextId = 0;

    const lynxObj = globalThis.lynx as typeof lynx & { reportError?: (error: Error) => void };
    const oldReportError = lynxObj.reportError;
    const reportErrorSpy = vi.fn();
    lynxObj.reportError = reportErrorSpy;

    const after = new BackgroundElementTemplateInstance('after');
    const before: SerializedETInstance = [-1, 'before', {}, {}];

    const stream = hydrateBackground(before, after);

    expect(stream).toMatchInlineSnapshot(`[]`);
    const firstError = reportErrorSpy.mock.calls[0]?.[0] as Error | undefined;
    expect(firstError?.message).toMatchInlineSnapshot(
      `"ElementTemplate hydrate key mismatch: main='before' background='after'."`,
    );
    expect(after.instanceId).toBe(1);

    reportErrorSpy.mockClear();
    (globalThis as unknown as { __LYNX_REPORT_ERROR_CALLS: Error[] }).__LYNX_REPORT_ERROR_CALLS = [];
    lynxObj.reportError = oldReportError;
  });

  it('updates instance id but skips diff for raw-text', () => {
    backgroundElementTemplateInstanceManager.clear();
    backgroundElementTemplateInstanceManager.nextId = 0;

    const after = new BackgroundElementTemplateText('hi');
    const before: SerializedETInstance = [-11, 'raw-text', {}, { 0: { text: 'hi' } }];

    const stream = hydrateBackground(before, after);

    expect(stream).toMatchInlineSnapshot(`[]`);
    expect(after.instanceId).toBe(-11);
    expect(backgroundElementTemplateInstanceManager.get(-11)).toBe(after);
  });

  afterEach(() => {
    cleanupNative();
    envManager.setUseElementTemplate(false);
  });

  describe('Attrs', () => {
    it('aligns ids and patches attrs', () => {
      function App() {
        const src = __BACKGROUND__ ? 'background.png' : 'main.png';
        return <view {...({ src } as any)} />;
      }

      const { before, after } = renderAndCollect(App);

      const stream = hydrateBackground(before, after);

      expect(after.instanceId).toBe(before[0]);
      expect(stream).toMatchInlineSnapshot(`
        [
          -1,
          [
            4,
            0,
            {
              "src": "background.png",
            },
          ],
        ]
      `);
    });

    it('removes attributes missing on background', () => {
      function App() {
        const props = __BACKGROUND__
          ? { id: 'same' }
          : { id: 'same', title: 'main' };
        return <view {...(props as any)} />;
      }

      const { before, after } = renderAndCollect(App);
      const stream = hydrateBackground(before, after);

      expect(stream).toMatchInlineSnapshot(`
        [
          -1,
          [
            4,
            0,
            {
              "title": undefined,
            },
          ],
        ]
      `);
    });

    it('adds attributes present only in background', () => {
      function App() {
        const props = __BACKGROUND__
          ? { id: 'same', title: 'background' }
          : { id: 'same' };
        return <view {...(props as any)} />;
      }

      const { before, after } = renderAndCollect(App);
      const stream = hydrateBackground(before, after);

      expect(stream).toMatchInlineSnapshot(`
        [
          -1,
          [
            4,
            0,
            {
              "title": "background",
            },
          ],
        ]
      `);
    });

    it('skips patch when attrs are identical', () => {
      function App() {
        return <view {...({ id: 'same', title: 'same' } as any)} />;
      }

      const { before, after } = renderAndCollect(App);
      const stream = hydrateBackground(before, after);

      expect(stream).toMatchInlineSnapshot(`[]`);
    });

    it('handles attrs object value updates', () => {
      function App() {
        const attrs = __BACKGROUND__
          ? {
            0: { id: 'b' },
            2: { data: 'extra' },
          }
          : {
            0: { id: 'a' },
            1: { title: 'main' },
          };
        return <view {...({ 'data-a': attrs, b: attrs } as any)} />;
      }

      const { before, after } = renderAndCollect(App);
      const stream = hydrateBackground(before, after);

      expect(stream).toMatchInlineSnapshot(`
        [
          -1,
          [
            4,
            0,
            {
              "b": {
                "0": {
                  "id": "b",
                },
                "2": {
                  "data": "extra",
                },
              },
              "data-a": {
                "0": {
                  "id": "b",
                },
                "2": {
                  "data": "extra",
                },
              },
            },
          ],
        ]
      `);
    });

    it('patches nested component attrs', () => {
      function Inner({ label }: { label: string }) {
        return (
          <view>
            <view id={label} />
            <view id={label} />
            <view id={label} />
          </view>
        );
      }

      function App() {
        const label = __BACKGROUND__ ? 'background' : 'main';
        return (
          <view {...({ label } as any)}>
            <Inner label={label} />
          </view>
        );
      }

      const { before, after } = renderAndCollect(App);

      const stream = hydrateBackground(before, after);

      expect(stream).toMatchInlineSnapshot(`
        [
          -2,
          [
            4,
            0,
            {
              "label": "background",
            },
          ],
          -1,
          [
            4,
            0,
            {
              "id": "background",
            },
            4,
            1,
            {
              "id": "background",
            },
            4,
            2,
            {
              "id": "background",
            },
          ],
        ]
      `);
    });

    it('handles explicit null or undefined values', () => {
      function App() {
        const props = __BACKGROUND__
          ? { a: null, b: undefined, c: 'exist' }
          : { a: 'exist', b: 'exist', c: null };
        return <view {...(props as any)} />;
      }

      const { before, after } = renderAndCollect(App);
      const stream = hydrateBackground(before, after);

      expect(stream).toMatchInlineSnapshot(`
        [
          -1,
          [
            4,
            0,
            {
              "a": null,
              "b": undefined,
              "c": "exist",
            },
          ],
        ]
      `);
    });

    it('diffs Array values', () => {
      function App() {
        const trans = __BACKGROUND__
          ? [{ x: 10 }]
          : [{ x: 20 }];
        return <view {...({ transform: trans } as any)} />;
      }

      const { before, after } = renderAndCollect(App);
      const stream = hydrateBackground(before, after);

      expect(stream).toMatchInlineSnapshot(`
        [
          -1,
          [
            4,
            0,
            {
              "transform": [
                {
                  "x": 10,
                },
              ],
            },
          ],
        ]
      `);
    });

    it('patches style object updates', () => {
      function App() {
        const style = __BACKGROUND__
          ? { color: 'red', width: 20 }
          : { color: 'blue', height: 10 };
        return <view style={style} />;
      }

      const { before, after } = renderAndCollect(App);
      const stream = hydrateBackground(before, after);

      expect(stream).toMatchInlineSnapshot(`
        [
          -1,
          [
            4,
            0,
            {
              "style": {
                "color": "red",
                "width": 20,
              },
            },
          ],
        ]
      `);
    });

    it('differentiates types (string vs number)', () => {
      function App() {
        return <view {...({ data: __BACKGROUND__ ? 1 : '1', check: __BACKGROUND__ ? true : 'true' } as any)} />;
      }

      const { before, after } = renderAndCollect(App);
      const stream = hydrateBackground(before, after);

      expect(stream).toMatchInlineSnapshot(`
        [
          -1,
          [
            4,
            0,
            {
              "check": true,
              "data": 1,
            },
          ],
        ]
      `);
    });

    it('diffs attributes and batches multiple patches for same target', () => {
      backgroundElementTemplateInstanceManager.clear();
      backgroundElementTemplateInstanceManager.nextId = 0;

      const after = new BackgroundElementTemplateInstance('view');
      after.attrs = new Map([
        [0, { a: 1, b: 2 }],
        [1, { c: 3 }],
      ]);

      const before: SerializedETInstance = [-1, 'view', {}, {
        0: { a: 1, b: 9, d: 4 },
        2: { x: 1 },
      }];

      const stream = hydrateBackground(before, after);

      expect(stream).toMatchInlineSnapshot(`
        [
          -1,
          [
            4,
            0,
            {
              "b": 2,
              "d": undefined,
            },
            4,
            1,
            {
              "c": 3,
            },
            4,
            2,
            {
              "x": undefined,
            },
          ],
        ]
      `);
    });
  });

  describe('Slot children', () => {
    it('creates and inserts new child instances', () => {
      function App() {
        return (
          <view>
            {__BACKGROUND__ ? <child /> : null}
          </view>
        );
      }

      const { before, after } = renderAndCollect(App);

      const stream = hydrateBackground(before, after);

      expect(after.instanceId).toBe(before[0]);
      expect(stream).toMatchInlineSnapshot(`
        [
          0,
          4,
          "_et_a94a8_test_13",
          [],
          -1,
          [
            2,
            0,
            null,
            4,
          ],
        ]
      `);
    });

    it('removes instances missing in background', () => {
      function App() {
        const firstNode = <view key='first' />;
        const secondNode = <view key='second' />;
        const children = __BACKGROUND__
          ? [firstNode]
          : [firstNode, secondNode];
        return <view>{children}</view>;
      }

      const { before, after } = renderAndCollect(App);

      const stream = hydrateBackground(before, after);

      expect(stream).toMatchInlineSnapshot(`
        [
          -3,
          [
            3,
            0,
            -2,
          ],
        ]
      `);
    });

    it('reorders child instances when background order differs', () => {
      function App() {
        const children = [<view key='first' />, <view key='second' />];
        if (__BACKGROUND__) {
          children.reverse();
        }
        return <view>{children}</view>;
      }

      const { before, after } = renderAndCollect(App);

      const stream = hydrateBackground(before, after);

      expect(stream).toMatchInlineSnapshot(`
        [
          -3,
          [
            2,
            0,
            null,
            -1,
          ],
        ]
      `);
    });

    it('reuses instances based on type ignoring keys', () => {
      // Background reuses based on type (sequential), ignoring the fact that keys are swapped.
      // Main: <A key=1 id=1>, <A key=2 id=2>
      // Background: <A key=2>, <A key=1>
      // Expectation: Background[0] becomes ID 1 (was key 2), Background[1] becomes ID 2 (was key 1).
      // If props differed, we'd see patches. Since props match type, mainly checking IDs.
      function App() {
        const c1 = <child key='1' id='1' />;
        const c2 = <child key='2' id='2' />;
        return (
          <view>
            {__BACKGROUND__ ? [c2, c1] : [c1, c2]}
          </view>
        );
      }

      const { before, after } = renderAndCollect(App);
      const stream = hydrateBackground(before, after);

      expect(stream).toMatchInlineSnapshot(`
        [
          -3,
          [
            2,
            0,
            null,
            -1,
          ],
        ]
      `);
    });

    it('handles mixed operations (remove + align + insert)', () => {
      // Main: [A, B, C]
      // BG:   [A, C, D]
      // B removed, C reused (shifted), D inserted.
      function App() {
        const A = <view key='A' />;
        const B = <view key='B' />;
        const C = <text key='C' />;
        const D = <image key='D' />;

        const children = __BACKGROUND__
          ? [A, C, D]
          : [A, B, C];

        return <view>{children}</view>;
      }

      const { before, after } = renderAndCollect(App);
      const stream = hydrateBackground(before, after);

      expect(stream).toMatchInlineSnapshot(`
        [
          -4,
          [
            3,
            0,
            -2,
          ],
          0,
          6,
          "_et_a94a8_test_26",
          [],
          -4,
          [
            2,
            0,
            null,
            6,
          ],
        ]
      `);
    });

    it('inserts new child before existing sibling', () => {
      function App() {
        const A = <view key='A' />;
        const B = <image key='B' />;
        const C = <text key='C' />;
        const children = __BACKGROUND__ ? [A, B, C] : [A, C];
        return <view>{children}</view>;
      }

      const { before, after } = renderAndCollect(App);
      const stream = hydrateBackground(before, after);

      expect(stream).toMatchInlineSnapshot(`
        [
          0,
          5,
          "_et_a94a8_test_29",
          [],
          -3,
          [
            2,
            0,
            -2,
            5,
          ],
        ]
      `);
    });

    it('handles missing slot record on main', () => {
      backgroundElementTemplateInstanceManager.clear();
      backgroundElementTemplateInstanceManager.nextId = 0;

      const rootInstance = new BackgroundElementTemplateInstance('root');
      const slot0 = new BackgroundElementTemplateSlot();
      slot0.setAttribute('id', 0);
      const child = new BackgroundElementTemplateInstance('child');
      slot0.appendChild(child);
      rootInstance.appendChild(slot0);

      const before = [-1, 'root', undefined, {}] as unknown as SerializedETInstance;
      const stream = hydrateBackground(before, rootInstance);

      expect(stream).toMatchInlineSnapshot(`
        [
          0,
          3,
          "child",
          [],
          -1,
          [
            2,
            0,
            null,
            3,
          ],
        ]
      `);
    });

    it('handles missing slot record on background', () => {
      backgroundElementTemplateInstanceManager.clear();
      backgroundElementTemplateInstanceManager.nextId = 0;

      const rootInstance = new BackgroundElementTemplateInstance('root');
      const beforeChild: SerializedETInstance = [-2, 'child', {}, {}];
      const before: SerializedETInstance = [-1, 'root', { 0: [beforeChild] }, {}];

      const stream = hydrateBackground(before, rootInstance);

      expect(stream).toMatchInlineSnapshot(`
        [
          -1,
          [
            3,
            0,
            -2,
          ],
        ]
      `);
    });

    it('creates missing nodes and recursively inserts their slot children', () => {
      backgroundElementTemplateInstanceManager.clear();
      backgroundElementTemplateInstanceManager.nextId = 0;

      // Main (before hydrate):
      // <root>
      //   <existing />
      //   <removed />
      // </root>
      //
      // Background (after render):
      // <root>
      //   <card id="card">
      //     <text>NEW</text>
      //   </card>
      //   <existing />
      // </root>

      const rootInstance = new BackgroundElementTemplateInstance('root');
      const slot0 = new BackgroundElementTemplateSlot();
      slot0.setAttribute('id', 0);
      rootInstance.appendChild(slot0);

      const existing = new BackgroundElementTemplateInstance('existing');
      slot0.appendChild(existing);

      const card = new BackgroundElementTemplateInstance('card');
      card.setAttribute('attrs', { 0: { id: 'card' } });
      const cardSlot = new BackgroundElementTemplateSlot();
      cardSlot.setAttribute('id', 0);
      const text = new BackgroundElementTemplateText('NEW');
      cardSlot.appendChild(text);
      card.appendChild(cardSlot);
      slot0.insertBefore(card, existing);

      const beforeExisting: SerializedETInstance = [-2, 'existing', {}, {}];
      const beforeRemoved: SerializedETInstance = [-3, 'removed', {}, {}];
      const before: SerializedETInstance = [-1, 'root', { 0: [beforeExisting, beforeRemoved] }, {}];

      const stream = hydrateBackground(before, rootInstance);

      expect(stream).toMatchInlineSnapshot(`
        [
          0,
          4,
          "card",
          [
            4,
            0,
            {
              "id": "card",
            },
          ],
          0,
          6,
          "raw-text",
          "NEW",
          4,
          [
            2,
            0,
            null,
            6,
          ],
          -1,
          [
            2,
            0,
            -2,
            4,
            3,
            0,
            -3,
          ],
        ]
      `);
    });

    it('moves instance before another existing sibling', () => {
      backgroundElementTemplateInstanceManager.clear();
      backgroundElementTemplateInstanceManager.nextId = 0;

      // Main (before hydrate):
      // <root>
      //   <A />
      //   <B />
      //   <C />
      // </root>
      //
      // Background (after render):
      // <root>
      //   <B />
      //   <A />
      //   <C />
      // </root>

      const rootInstance = new BackgroundElementTemplateInstance('root');
      const slot0 = new BackgroundElementTemplateSlot();
      slot0.setAttribute('id', 0);
      rootInstance.appendChild(slot0);

      const b = new BackgroundElementTemplateInstance('B');
      const a = new BackgroundElementTemplateInstance('A');
      const c = new BackgroundElementTemplateInstance('C');
      slot0.appendChild(b);
      slot0.appendChild(a);
      slot0.appendChild(c);

      const beforeA: SerializedETInstance = [-2, 'A', {}, {}];
      const beforeB: SerializedETInstance = [-3, 'B', {}, {}];
      const beforeC: SerializedETInstance = [-4, 'C', {}, {}];
      const before: SerializedETInstance = [-1, 'root', { 0: [beforeA, beforeB, beforeC] }, {}];

      const stream = hydrateBackground(before, rootInstance);

      expect(stream).toMatchInlineSnapshot(`
        [
          -1,
          [
            2,
            0,
            -4,
            -2,
          ],
        ]
      `);
    });

    it('handles non-string raw-text key on main', () => {
      backgroundElementTemplateInstanceManager.clear();
      backgroundElementTemplateInstanceManager.nextId = 0;

      // Main (before hydrate):
      // <root>
      //   <text>{1}</text>
      // </root>
      //
      // Background (after render):
      // <root>
      //   <text>x</text>
      // </root>

      const rootInstance = new BackgroundElementTemplateInstance('root');
      const slot0 = new BackgroundElementTemplateSlot();
      slot0.setAttribute('id', 0);
      rootInstance.appendChild(slot0);
      const rawText = new BackgroundElementTemplateText('x');
      slot0.appendChild(rawText);

      const beforeRawText: SerializedETInstance = [-2, 'raw-text', {}, { 0: { text: 1 } }];
      const before: SerializedETInstance = [-1, 'root', { 0: [beforeRawText] }, {}];

      const stream = hydrateBackground(before, rootInstance);

      expect(stream).toMatchInlineSnapshot(`
        [
          -1,
          [
            3,
            0,
            -2,
          ],
          0,
          3,
          "raw-text",
          "x",
          -1,
          [
            2,
            0,
            null,
            3,
          ],
        ]
      `);
      expect(rawText.instanceId).toBe(3);
    });

    it('creates raw-text element instance with empty text', () => {
      backgroundElementTemplateInstanceManager.clear();
      backgroundElementTemplateInstanceManager.nextId = 0;

      const rootInstance = new BackgroundElementTemplateInstance('root');
      const slot0 = new BackgroundElementTemplateSlot();
      slot0.setAttribute('id', 0);
      rootInstance.appendChild(slot0);

      const rawText = new BackgroundElementTemplateInstance('raw-text');
      slot0.appendChild(rawText);

      const before = [-1, 'root', undefined, {}] as unknown as SerializedETInstance;
      const stream = hydrateBackground(before, rootInstance);

      expect(stream).toMatchInlineSnapshot(`
        [
          0,
          3,
          "raw-text",
          "",
          -1,
          [
            2,
            0,
            null,
            3,
          ],
        ]
      `);
    });
  });

  describe('Complex trees', () => {
    it('hydrates deeply nested dynamic content correctly', () => {
      function Header({ title }: { title: string }) {
        return <text>{title}</text>;
      }
      function Content({ children }: { children: any }) {
        return <view>{children}</view>;
      }
      function Card({ children }: { children: any }) {
        return <view>{children}</view>;
      }

      function App() {
        // Main: Header="Main", Content=[A]
        // BG: Header="BG", Content=[A, B]
        return (
          <Card>
            <Header key='h' title={__BACKGROUND__ ? 'BG' : 'Main'} />
            <Content key='c'>
              <text>A</text>
              {__BACKGROUND__ ? <text>B</text> : null}
            </Content>
          </Card>
        );
      }

      const { before, after } = renderAndCollect(App);
      const stream = hydrateBackground(before, after);

      // Expected Patches:
      // 1. Update Header title "Main" -> "BG"
      // 2. Insert "B" into Content
      expect(stream).toMatchInlineSnapshot(`
        [
          -2,
          [
            3,
            0,
            -1,
          ],
          0,
          6,
          "raw-text",
          "BG",
          -2,
          [
            2,
            0,
            null,
            6,
          ],
          0,
          10,
          "_et_a94a8_test_36",
          [],
          -4,
          [
            2,
            0,
            null,
            10,
          ],
        ]
      `);
    });
  });
});
