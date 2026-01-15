import { vi } from 'vitest';

import { root } from '../../../../../src/element-template/index.js';
import { ElementTemplateLifecycleConstant } from '../../../../../src/element-template/protocol/lifecycle-constant.js';
import { resetTemplateId } from '../../../../../src/element-template/runtime/template/handle.js';
import { ElementTemplateRegistry } from '../../../../../src/element-template/runtime/template/registry.js';
import { flushCoreContextEvents } from '../../../test-utils/mockNativePapi/context.js';
import { installMockNativePapi } from '../../../test-utils/mockNativePapi.js';

declare const renderPage: () => void;

interface HydrationContext {
  hydrationData: unknown[];
  cleanup: () => void;
  onHydrate: (event: { data: unknown }) => void;
}

function setup(): HydrationContext {
  vi.clearAllMocks();
  const installed = installMockNativePapi({ clearTemplatesOnCleanup: false });
  ElementTemplateRegistry.clear();
  resetTemplateId();
  (globalThis as { __USE_ELEMENT_TEMPLATE__?: boolean }).__USE_ELEMENT_TEMPLATE__ = true;

  const hydrationData: unknown[] = [];
  const onHydrate = vi.fn().mockImplementation((event: { data: unknown }) => {
    const data = event.data;
    if (Array.isArray(data)) {
      for (const item of data) {
        hydrationData.push(item);
      }
    }
  });
  lynx.getCoreContext().addEventListener(ElementTemplateLifecycleConstant.hydrate, onHydrate);

  return {
    hydrationData,
    cleanup: installed.cleanup,
    onHydrate,
  };
}

function teardown(context: HydrationContext): void {
  lynx.getCoreContext().removeEventListener(ElementTemplateLifecycleConstant.hydrate, context.onHydrate);
  context.cleanup();
  (globalThis as { __USE_ELEMENT_TEMPLATE__?: boolean }).__USE_ELEMENT_TEMPLATE__ = undefined;
}

type CaseRunner = (context: HydrationContext) => void;

const cases: Record<string, CaseRunner> = {};

function defineCase(name: string, runner: CaseRunner): void {
  cases[name] = runner;
}

export function runCaseByName(name: string): unknown {
  const runner = cases[name];
  if (!runner) {
    throw new Error(`Unknown hydration-data case: ${name}`);
  }
  const context = setup();
  try {
    runner(context);
    renderPage();
    flushCoreContextEvents();
    return [...context.hydrationData];
  } finally {
    teardown(context);
  }
}

defineCase('simple-element', () => {
  const logo = 'logo.png';
  function App() {
    return (
      <view id={logo}>
        Hello
      </view>
    );
  }
  root.render(<App />);
});

defineCase('nested-instances', () => {
  function App() {
    return (
      <view>
        <view />
      </view>
    );
  }
  root.render(<App />);
});

defineCase('text-children', () => {
  const text = 'Hello';
  function App() {
    return (
      <view>
        {text}
      </view>
    );
  }
  root.render(<App />);
});

defineCase('multiple-root-instances', () => {
  function App() {
    return (
      <>
        <view />
        <view />
      </>
    );
  }
  root.render(<App />);
});

defineCase('sub-components', () => {
  function MyComp({ name }: { name: string }) {
    return (
      <view class='comp'>
        {name}
      </view>
    );
  }

  function App() {
    return (
      <view class='root'>
        <MyComp name='inner' />
      </view>
    );
  }

  root.render(<App />);
});

defineCase('jsx-map-dynamic-list', () => {
  function App() {
    return (
      <view>
        {[1, 2, 3].map((i) => (
          <view key={i}>
            <text>{`item-${i}`}</text>
          </view>
        ))}
      </view>
    );
  }
  root.render(<App />);
});
