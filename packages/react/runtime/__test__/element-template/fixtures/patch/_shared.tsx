import { vi } from 'vitest';

import { BackgroundElementTemplateInstance } from '../../../../src/element-template/background/instance.js';
import { root } from '../../../../src/element-template/index.js';
import { resetElementTemplatePatchListener } from '../../../../src/element-template/native/patch-listener.js';
import { ElementTemplateLifecycleConstant } from '../../../../src/element-template/protocol/lifecycle-constant.js';
import type { SerializedETInstance } from '../../../../src/element-template/protocol/types.js';
import { __root } from '../../../../src/element-template/runtime/page/root-instance.js';
import { ElementTemplateEnvManager } from '../../test-utils/envManager.js';
import { installMockNativePapi } from '../../test-utils/mockNativePapi.js';

declare const renderPage: () => void;

interface RootWithFirstChild {
  firstChild: BackgroundElementTemplateInstance | null;
}

export interface PatchContext {
  envManager: ElementTemplateEnvManager;
  hydrationData: SerializedETInstance[];
  cleanupNative: () => void;
  onHydrate: (event: { data: unknown }) => void;
}

export function setupPatchContext(): PatchContext {
  vi.clearAllMocks();
  const installed = installMockNativePapi({ clearTemplatesOnCleanup: false });
  const cleanupNative = installed.cleanup;

  const envManager = new ElementTemplateEnvManager();
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

  return {
    envManager,
    hydrationData,
    cleanupNative,
    onHydrate,
  };
}

export function teardownPatchContext(context: PatchContext): void {
  lynx.getCoreContext().removeEventListener(ElementTemplateLifecycleConstant.hydrate, context.onHydrate);
  resetElementTemplatePatchListener();
  context.cleanupNative();
  context.envManager.setUseElementTemplate(false);
  (globalThis as { __LYNX_REPORT_ERROR_CALLS?: Error[] }).__LYNX_REPORT_ERROR_CALLS = [];
}

export function renderAndCollect(App: () => JSX.Element, context: PatchContext): {
  before: SerializedETInstance;
  after: BackgroundElementTemplateInstance;
} {
  root.render(<App />);
  context.envManager.switchToMainThread();
  renderPage();
  context.envManager.switchToBackground();

  const before = context.hydrationData[0];
  if (!before) {
    throw new Error('Missing hydration data.');
  }

  const backgroundRoot = __root as unknown as RootWithFirstChild;
  const after = backgroundRoot.firstChild;
  if (!after) {
    throw new Error('Missing background root child.');
  }

  return { before, after };
}
