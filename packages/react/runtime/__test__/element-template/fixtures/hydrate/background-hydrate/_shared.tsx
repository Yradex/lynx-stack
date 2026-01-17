import { vi } from 'vitest';

import {
  GlobalCommitContext,
  resetGlobalCommitContext,
} from '../../../../../src/element-template/background/commit-context.js';
import {
  hydrate as hydrateBackground,
  hydrateIntoContext,
} from '../../../../../src/element-template/background/hydrate.js';
import {
  installElementTemplateHydrationListener,
  resetElementTemplateHydrationListener,
} from '../../../../../src/element-template/background/hydration-listener.js';
import '../../../../../src/element-template/native/index.js';
import {
  BackgroundElementTemplateInstance,
  BackgroundElementTemplateSlot,
  BackgroundElementTemplateText,
} from '../../../../../src/element-template/background/instance.js';
import { backgroundElementTemplateInstanceManager } from '../../../../../src/element-template/background/manager.js';
import { root } from '../../../../../src/element-template/index.js';
import {
  installElementTemplatePatchListener,
  resetElementTemplatePatchListener,
} from '../../../../../src/element-template/native/patch-listener.js';
import { ElementTemplateLifecycleConstant } from '../../../../../src/element-template/protocol/lifecycle-constant.js';
import type { SerializedETInstance } from '../../../../../src/element-template/protocol/types.js';
import { __page } from '../../../../../src/element-template/runtime/page/page.js';
import { __root } from '../../../../../src/element-template/runtime/page/root-instance.js';
import { ElementTemplateEnvManager } from '../../../test-utils/debug/envManager.js';
import { installMockNativePapi } from '../../../test-utils/mock/mockNativePapi.js';
import { serializeToJSX } from '../../../test-utils/debug/serializer.js';

declare const renderPage: () => void;

declare module '@lynx-js/types' {
  interface IntrinsicElements {
    child: any;
  }
}

interface CaseContext {
  hydrationData: SerializedETInstance[];
  onHydrate: (event: { data: unknown }) => void;
}

const envManager = new ElementTemplateEnvManager();

function setup(): CaseContext {
  vi.clearAllMocks();
  installMockNativePapi({ clearTemplatesOnCleanup: false });
  const hydrationData: SerializedETInstance[] = [];
  envManager.resetEnv('background');
  envManager.setUseElementTemplate(true);

  const onHydrate = vi.fn().mockImplementation((event: { data: unknown }) => {
    const data = event.data;
    if (Array.isArray(data)) {
      for (const item of data) {
        hydrationData.push(item as SerializedETInstance);
      }
    }
  });
  lynx.getCoreContext().addEventListener(ElementTemplateLifecycleConstant.hydrate, onHydrate);

  return { hydrationData, onHydrate };
}

function teardown(context: CaseContext): void {
  // cleanup is automatic
  lynx.getCoreContext().removeEventListener(ElementTemplateLifecycleConstant.hydrate, context.onHydrate);
  envManager.setUseElementTemplate(false);
  (globalThis as { __LYNX_REPORT_ERROR_CALLS?: Error[] }).__LYNX_REPORT_ERROR_CALLS = [];
}

function renderAndCollect(App: () => JSX.Element, context: CaseContext) {
  root.render(<App />);
  envManager.switchToMainThread();
  renderPage();
  envManager.switchToBackground();

  const before = context.hydrationData[0]!;
  const backgroundRoot = __root as BackgroundElementTemplateInstance;
  const after = backgroundRoot.firstChild!;

  return { before, after };
}

type CaseRunner = (context: CaseContext) => unknown;

const cases: Record<string, CaseRunner> = {};

function defineCase(name: string, runner: CaseRunner): void {
  cases[name] = runner;
}

export function runCaseByName(name: string): unknown {
  const runner = cases[name];
  if (!runner) {
    throw new Error(`Unknown background-hydrate case: ${name}`);
  }
  const context = setup();
  try {
    return runner(context);
  } finally {
    teardown(context);
  }
}

{
  defineCase('reports-key-mismatch', () => {
    backgroundElementTemplateInstanceManager.clear();
    backgroundElementTemplateInstanceManager.nextId = 0;

    const lynxObj = globalThis.lynx as typeof lynx & { reportError?: (error: Error) => void };
    const oldReportError = lynxObj.reportError;
    const reportErrorSpy = vi.fn();
    lynxObj.reportError = reportErrorSpy;

    const after = new BackgroundElementTemplateInstance('after');
    const before: SerializedETInstance = [-1, 'before', {}, {}];

    const stream = hydrateBackground(before, after);
    const firstError = reportErrorSpy.mock.calls[0]?.[0] as Error | undefined;

    reportErrorSpy.mockClear();
    (globalThis as { __LYNX_REPORT_ERROR_CALLS?: Error[] }).__LYNX_REPORT_ERROR_CALLS = [];
    lynxObj.reportError = oldReportError;

    return {
      stream,
      errorMessage: firstError?.message ?? null,
      afterInstanceId: after.instanceId,
    };
  });
}

{
  defineCase('updates-raw-text-instance-id', () => {
    backgroundElementTemplateInstanceManager.clear();
    backgroundElementTemplateInstanceManager.nextId = 0;

    const after = new BackgroundElementTemplateText('hi');
    const before: SerializedETInstance = [-11, 'raw-text', {}, { 0: { text: 'hi' } }];

    const stream = hydrateBackground(before, after);

    return {
      stream,
      afterInstanceId: after.instanceId,
      managerHasAfter: backgroundElementTemplateInstanceManager.get(-11) === after,
    };
  });
}

{
  defineCase('attrs.aligns-ids-and-patches', (context) => {
    function App() {
      const src = __BACKGROUND__ ? 'background.png' : 'main.png';
      return <view {...({ src } as any)} />;
    }

    const { before, after } = renderAndCollect(App, context);
    const stream = hydrateBackground(before, after);

    return {
      stream,
      beforeInstanceId: before[0],
      afterInstanceId: after.instanceId,
    };
  });
}

{
  defineCase('attrs.removes-missing', (context) => {
    function App() {
      const props = __BACKGROUND__
        ? { id: 'same' }
        : { id: 'same', title: 'main' };
      return <view {...(props as any)} />;
    }

    const { before, after } = renderAndCollect(App, context);
    const stream = hydrateBackground(before, after);
    return { stream };
  });
}

{
  defineCase('attrs.adds-background-only', (context) => {
    function App() {
      const props = __BACKGROUND__
        ? { id: 'same', title: 'background' }
        : { id: 'same' };
      return <view {...(props as any)} />;
    }

    const { before, after } = renderAndCollect(App, context);
    const stream = hydrateBackground(before, after);
    return { stream };
  });
}

{
  defineCase('attrs.skips-identical', (context) => {
    function App() {
      const props = { id: 'same' };
      return <view {...(props as any)} />;
    }

    const { before, after } = renderAndCollect(App, context);
    const stream = hydrateBackground(before, after);
    return { stream };
  });
}

{
  defineCase('attrs.object-value-updates', (context) => {
    function App() {
      const props = __BACKGROUND__
        ? { id: 'same', data: { foo: 'bar' } }
        : { id: 'same', data: { foo: 'baz' } };
      return <view {...(props as any)} />;
    }

    const { before, after } = renderAndCollect(App, context);
    const stream = hydrateBackground(before, after);
    return { stream };
  });
}

{
  defineCase('attrs.patches-nested-component', (context) => {
    function App() {
      const props = __BACKGROUND__
        ? { id: 'same', info: { key: 'new' } }
        : { id: 'same', info: { key: 'old' } };
      return (
        <view>
          <child {...(props as any)} />
        </view>
      );
    }

    const { before, after } = renderAndCollect(App, context);
    const stream = hydrateBackground(before, after);
    return { stream };
  });
}

{
  defineCase('attrs.nullish-values', (context) => {
    function App() {
      const props = __BACKGROUND__
        ? { id: null, title: undefined }
        : { id: 'same', title: 'main' };
      return <view {...(props as any)} />;
    }

    const { before, after } = renderAndCollect(App, context);
    const stream = hydrateBackground(before, after);
    return { stream };
  });
}

{
  defineCase('attrs.array-diff', (context) => {
    function App() {
      const props = __BACKGROUND__
        ? { ids: [1, 2] }
        : { ids: [1] };
      return <view {...(props as any)} />;
    }

    const { before, after } = renderAndCollect(App, context);
    const stream = hydrateBackground(before, after);
    return { stream };
  });
}

{
  defineCase('attrs.style-object-updates', (context) => {
    function App() {
      const props = __BACKGROUND__
        ? { style: { color: 'red', fontSize: 12 } }
        : { style: { color: 'blue', fontSize: 12 } };
      return <view {...(props as any)} />;
    }

    const { before, after } = renderAndCollect(App, context);
    const stream = hydrateBackground(before, after);
    return { stream };
  });
}

{
  defineCase('attrs.type-diff', (context) => {
    function App() {
      const props = __BACKGROUND__
        ? { id: 123 }
        : { id: '123' };
      return <view {...(props as any)} />;
    }

    const { before, after } = renderAndCollect(App, context);
    const stream = hydrateBackground(before, after);
    return { stream };
  });
}

{
  defineCase('attrs.batch-multiple-patches', (context) => {
    function App() {
      const props = __BACKGROUND__
        ? { id: 'same', title: 'bg', index: 1 }
        : { id: 'same', title: 'main', index: 0 };
      return <view {...(props as any)} />;
    }

    const { before, after } = renderAndCollect(App, context);
    const stream = hydrateBackground(before, after);
    return { stream };
  });
}

{
  defineCase('children.creates-and-inserts-new', (context) => {
    function App() {
      return (
        <view>
          {__BACKGROUND__ ? <view key='new' /> : null}
        </view>
      );
    }

    const { before, after } = renderAndCollect(App, context);
    const stream = hydrateBackground(before, after);
    return { stream };
  });
}

{
  defineCase('children.removes-missing', (context) => {
    function App() {
      return (
        <view>
          {__BACKGROUND__ ? null : <view key='gone' />}
        </view>
      );
    }

    const { before, after } = renderAndCollect(App, context);
    const stream = hydrateBackground(before, after);
    return { stream };
  });
}

{
  defineCase('children.reorders-when-order-differs', (context) => {
    function App() {
      return (
        <view>
          {__BACKGROUND__
            ? (
              <>
                <view key='b' />
                <view key='a' />
              </>
            )
            : (
              <>
                <view key='a' />
                <view key='b' />
              </>
            )}
        </view>
      );
    }

    const { before, after } = renderAndCollect(App, context);
    const stream = hydrateBackground(before, after);
    return { stream };
  });
}

{
  defineCase('children.reuses-by-type-ignoring-keys', (context) => {
    function App() {
      const c1 = <child key='1' id='1' />;
      const c2 = <child key='2' id='2' />;
      return (
        <view>
          {__BACKGROUND__ ? [c2, c1] : [c1, c2]}
        </view>
      );
    }

    const { before, after } = renderAndCollect(App, context);
    const stream = hydrateBackground(before, after);
    return { stream };
  });
}

{
  defineCase('children.mixed-operations', (context) => {
    function App() {
      return (
        <view>
          {__BACKGROUND__
            ? (
              <>
                <view key='b' />
                <view key='c' />
              </>
            )
            : (
              <>
                <view key='a' />
                <view key='b' />
              </>
            )}
        </view>
      );
    }

    const { before, after } = renderAndCollect(App, context);
    const stream = hydrateBackground(before, after);
    return { stream };
  });
}

{
  defineCase('children.inserts-before-existing-sibling', (context) => {
    function App() {
      return (
        <view>
          {__BACKGROUND__
            ? (
              <>
                <view key='c' />
                <view key='a' />
              </>
            )
            : (
              <>
                <view key='a' />
                <view key='c' />
              </>
            )}
        </view>
      );
    }

    const { before, after } = renderAndCollect(App, context);
    const stream = hydrateBackground(before, after);
    return { stream };
  });
}

{
  defineCase('children.missing-slot-record-on-main', (context) => {
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
    return { stream };
  });
}

{
  defineCase('children.missing-slot-record-on-background', (context) => {
    backgroundElementTemplateInstanceManager.clear();
    backgroundElementTemplateInstanceManager.nextId = 0;

    const rootInstance = new BackgroundElementTemplateInstance('root');
    const beforeChild: SerializedETInstance = [-2, 'child', {}, {}];
    const before: SerializedETInstance = [-1, 'root', { 0: [beforeChild] }, {}];

    const stream = hydrateBackground(before, rootInstance);
    return { stream };
  });
}

{
  defineCase('children.creates-missing-nodes-recursively', (context) => {
    backgroundElementTemplateInstanceManager.clear();
    backgroundElementTemplateInstanceManager.nextId = 0;

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
    return { stream };
  });
}

{
  defineCase('children.moves-before-existing-sibling', (context) => {
    function App() {
      return (
        <view>
          {__BACKGROUND__
            ? (
              <>
                <view key='b' />
                <view key='a' />
                <view key='c' />
              </>
            )
            : (
              <>
                <view key='a' />
                <view key='b' />
                <view key='c' />
              </>
            )}
        </view>
      );
    }

    const { before, after } = renderAndCollect(App, context);
    const stream = hydrateBackground(before, after);
    return { stream };
  });
}

{
  defineCase('children.non-string-raw-text-key-on-main', (context) => {
    function App() {
      return (
        <view>
          {__BACKGROUND__ ? <text>{2}</text> : <text>{1}</text>}
        </view>
      );
    }

    const { before, after } = renderAndCollect(App, context);
    const stream = hydrateBackground(before, after);
    return { stream };
  });
}

{
  defineCase('children.raw-text-instance-empty-text', (context) => {
    backgroundElementTemplateInstanceManager.clear();
    backgroundElementTemplateInstanceManager.nextId = 0;

    const rootInstance = new BackgroundElementTemplateInstance('root');
    const slot0 = new BackgroundElementTemplateSlot();
    slot0.setAttribute('id', 0);
    rootInstance.appendChild(slot0);
    const rawText = new BackgroundElementTemplateText('');
    slot0.appendChild(rawText);

    const before = [-1, 'root', { 0: [[3, 'raw-text', {}, { 0: { text: '' } }]] }] as unknown as SerializedETInstance;
    const stream = hydrateBackground(before, rootInstance);

    return {
      stream,
      rawTextInstanceId: rawText.instanceId,
    };
  });
}

{
  defineCase('coverage.raw-text-key-branches', () => {
    backgroundElementTemplateInstanceManager.clear();
    backgroundElementTemplateInstanceManager.nextId = 0;

    const rootInstance = new BackgroundElementTemplateInstance('root');
    const slot0 = new BackgroundElementTemplateSlot();
    slot0.setAttribute('id', 0);
    rootInstance.appendChild(slot0);

    const rawTextText = new BackgroundElementTemplateText('bg');
    const rawTextInstance = new BackgroundElementTemplateInstance('raw-text');
    slot0.appendChild(rawTextText);
    slot0.appendChild(rawTextInstance);

    const beforeExistingString: SerializedETInstance = [
      rawTextText.instanceId,
      'raw-text',
      {},
      { 0: { text: 'bg' } },
    ];
    const beforeExistingNonString: SerializedETInstance = [
      rawTextInstance.instanceId,
      'raw-text',
      {},
      { 0: { text: 123 } },
    ];
    const beforeMissingString: SerializedETInstance = [-2, 'raw-text', {}, { 0: { text: 'missing' } }];
    const beforeMissingNonString: SerializedETInstance = [-3, 'raw-text', {}, { 0: { text: 456 } }];

    const before: SerializedETInstance = [
      rootInstance.instanceId,
      'root',
      {
        0: [
          beforeExistingString,
          beforeExistingNonString,
          beforeMissingString,
          beforeMissingNonString,
        ],
      },
      {},
    ];

    const stream = hydrateBackground(before, rootInstance);
    return { stream };
  });
}

{
  defineCase('children.iterates-existing-slots', () => {
    backgroundElementTemplateInstanceManager.clear();
    backgroundElementTemplateInstanceManager.nextId = 0;

    const rootInstance = new BackgroundElementTemplateInstance('root');
    const slot0 = new BackgroundElementTemplateSlot();
    slot0.setAttribute('id', 0);
    rootInstance.appendChild(slot0);
    const slot1 = new BackgroundElementTemplateSlot();
    slot1.setAttribute('id', 1);
    rootInstance.appendChild(slot1);

    const before = [-1, 'root', { 1: [] }, {}] as unknown as SerializedETInstance;
    const stream = hydrateBackground(before, rootInstance);
    return { stream };
  });
}

{
  defineCase('children.skips-duplicate-create-emission', () => {
    backgroundElementTemplateInstanceManager.clear();
    backgroundElementTemplateInstanceManager.nextId = 0;

    const rootInstance = new BackgroundElementTemplateInstance('root');
    const slot0 = new BackgroundElementTemplateSlot();
    slot0.setAttribute('id', 0);
    rootInstance.appendChild(slot0);
    const child = new BackgroundElementTemplateInstance('child');
    slot0.appendChild(child);

    const before = [-1, 'root', { 0: [] }, {}] as unknown as SerializedETInstance;

    const created = new Set<number>();
    resetGlobalCommitContext();
    hydrateIntoContext(before, rootInstance, created);
    const first = GlobalCommitContext.patches;
    resetGlobalCommitContext();
    const firstIncludes = first.includes(0);

    resetGlobalCommitContext();
    hydrateIntoContext(before, rootInstance, created);
    const second = GlobalCommitContext.patches;
    resetGlobalCommitContext();
    const secondIncludes = second.includes(0);

    return {
      firstIncludes,
      secondIncludes,
    };
  });
}

{
  defineCase('children.missing-attrs-element', () => {
    backgroundElementTemplateInstanceManager.clear();
    backgroundElementTemplateInstanceManager.nextId = 0;

    const rootInstance = new BackgroundElementTemplateInstance('root');
    const slot0 = new BackgroundElementTemplateSlot();
    slot0.setAttribute('id', 0);
    rootInstance.appendChild(slot0);

    const before = [-1, 'root', { 0: undefined }] as unknown as SerializedETInstance;
    const stream = hydrateBackground(before, rootInstance);
    return { stream };
  });
}

{
  defineCase('coverage.move-before-child', () => {
    backgroundElementTemplateInstanceManager.clear();
    backgroundElementTemplateInstanceManager.nextId = 0;

    const rootInstance = new BackgroundElementTemplateInstance('root');
    const slot0 = new BackgroundElementTemplateSlot();
    slot0.setAttribute('id', 0);
    rootInstance.appendChild(slot0);

    const childA = new BackgroundElementTemplateInstance('a');
    const childB = new BackgroundElementTemplateInstance('b');
    const childC = new BackgroundElementTemplateInstance('c');
    slot0.appendChild(childB);
    slot0.appendChild(childA);
    slot0.appendChild(childC);

    const beforeChildA: SerializedETInstance = [childA.instanceId, 'a', {}, {}];
    const beforeChildB: SerializedETInstance = [childB.instanceId, 'b', {}, {}];
    const beforeChildC: SerializedETInstance = [childC.instanceId, 'c', {}, {}];
    const before: SerializedETInstance = [
      rootInstance.instanceId,
      'root',
      { 0: [beforeChildA, beforeChildB, beforeChildC] },
      {},
    ];

    const stream = hydrateBackground(before, rootInstance);
    return { stream };
  });
}

{
  defineCase('coverage.emit-create-raw-text', () => {
    backgroundElementTemplateInstanceManager.clear();
    backgroundElementTemplateInstanceManager.nextId = 0;
    resetGlobalCommitContext();

    const rawText = new BackgroundElementTemplateText('raw');
    rawText.emitCreate();
    const patches = [...GlobalCommitContext.patches];
    resetGlobalCommitContext();

    return { patches };
  });
}

{
  defineCase('coverage.emit-create-raw-text-non-text', () => {
    backgroundElementTemplateInstanceManager.clear();
    backgroundElementTemplateInstanceManager.nextId = 0;
    resetGlobalCommitContext();

    const rawText = new BackgroundElementTemplateInstance('raw-text');
    rawText.emitCreate();
    const patches = [...GlobalCommitContext.patches];
    resetGlobalCommitContext();

    return { patches };
  });
}

{
  defineCase('complex-trees.deeply-nested-dynamic-content', (context) => {
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

    const { before, after } = renderAndCollect(App, context);
    const stream = hydrateBackground(before, after);
    return { stream };
  });
}

{
  defineCase('full-flow.dispatches-update-event', (context) => {
    installElementTemplateHydrationListener();
    installElementTemplatePatchListener();

    function App() {
      const id = __BACKGROUND__ ? 'bg' : 'main';
      return <view id={id} />;
    }

    renderAndCollect(App, context);

    envManager.switchToMainThread();
    const pageJsx = serializeToJSX(__page);

    resetElementTemplatePatchListener();
    resetElementTemplateHydrationListener();

    return { pageJsx };
  });
}
