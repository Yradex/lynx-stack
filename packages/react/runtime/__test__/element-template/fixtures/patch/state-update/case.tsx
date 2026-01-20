import { useState } from '@lynx-js/react';
import { options } from 'preact';

import { resetGlobalCommitContext } from '../../../../../src/element-template/background/commit-context.js';
import {
  installElementTemplateHydrationListener,
  resetElementTemplateHydrationListener,
} from '../../../../../src/element-template/background/hydration-listener.js';
import { root } from '../../../../../src/element-template/index.js';
import {
  installElementTemplatePatchListener,
  resetElementTemplatePatchListener,
} from '../../../../../src/element-template/native/patch-listener.js';
import { ElementTemplateLifecycleConstant } from '../../../../../src/element-template/protocol/lifecycle-constant.js';
import type {
  ElementTemplateCommitContext,
  SerializedETInstance,
} from '../../../../../src/element-template/protocol/types.js';
import { __page } from '../../../../../src/element-template/runtime/page/page.js';
import { __root } from '../../../../../src/element-template/runtime/page/root-instance.js';
import { ElementTemplateEnvManager } from '../../../test-utils/debug/envManager.js';
import { resetTemplateId } from '../../../../../src/element-template/runtime/template/handle.js';
import { ElementTemplateRegistry } from '../../../../../src/element-template/runtime/template/registry.js';
import { installMockNativePapi } from '../../../test-utils/mock/mockNativePapi.js';
import { serializeToJSX } from '../../../test-utils/debug/serializer.js';
import { formatPatchStream } from '../../../test-utils/debug/updateRunner.js';
import { installElementTemplateCommitHook } from '../../../../../src/element-template/background/commit-hook.js';

declare const renderPage: () => void;

export async function run() {
  const envManager = new ElementTemplateEnvManager();
  const { cleanup } = installMockNativePapi({ clearTemplatesOnCleanup: false });
  const hydrationData: SerializedETInstance[] = [];
  const updateEvents: ElementTemplateCommitContext[] = [];

  const onHydrate = (event: { data: unknown }) => {
    const data = event.data;
    if (Array.isArray(data)) {
      for (const item of data) {
        hydrationData.push(item as SerializedETInstance);
      }
    }
  };

  const onUpdate = (event: { data: unknown }) => {
    updateEvents.push(event.data as ElementTemplateCommitContext);
  };

  envManager.resetEnv('background');
  envManager.setUseElementTemplate(true);

  // Ensure consistent handle ids across threads
  ElementTemplateRegistry.clear();
  resetTemplateId();

  envManager.switchToBackground();
  lynx.getCoreContext().addEventListener(ElementTemplateLifecycleConstant.hydrate, onHydrate);
  installElementTemplateHydrationListener();
  installElementTemplateCommitHook();

  envManager.switchToMainThread();
  lynx.getJSContext().addEventListener(ElementTemplateLifecycleConstant.update, onUpdate);
  installElementTemplatePatchListener();

  envManager.switchToBackground();

  // Capture scheduled renders so we can flush them while still on background thread.
  const scheduledRenders: Array<() => void> = [];
  const previousDebounce = options.debounceRendering;
  options.debounceRendering = (cb) => {
    scheduledRenders.push(cb);
  };

  try {
    let triggerUpdate: (() => void) | undefined;

    function App() {
      const [label, setLabel] = useState('before');

      if (__BACKGROUND__) {
        triggerUpdate = () => setLabel('after');
      }

      return <view attrs={{ 0: { id: label } }} />;
    }

    root.render(<App />);
    // Use a fresh vnode for main-thread render to avoid clobbering background hook state.
    const backgroundJsx = (__root as { __jsx?: unknown }).__jsx;
    (__root as { __jsx?: unknown }).__jsx = <App />;
    envManager.switchToMainThread();
    renderPage();
    const beforePageJsx = serializeToJSX(__page);

    envManager.switchToBackground();
    (__root as { __jsx?: unknown }).__jsx = backgroundJsx;

    if (hydrationData.length === 0) {
      throw new Error('Missing hydration payload.');
    }

    envManager.switchToMainThread();
    updateEvents.length = 0;
    envManager.switchToBackground();

    resetGlobalCommitContext();
    triggerUpdate!();
    while (scheduledRenders.length > 0) {
      const flush = scheduledRenders.shift();
      flush?.();
    }

    envManager.switchToMainThread();
    const afterPageJsx = serializeToJSX(__page);
    const updatePayload = updateEvents[updateEvents.length - 1];
    const eventPatches = updatePayload?.patches ?? [];

    return {
      files: {
        'before-jsx.txt': beforePageJsx,
        'after-jsx.txt': afterPageJsx,
        'patches.txt': formatPatchStream(eventPatches),
      },
    };
  } finally {
    options.debounceRendering = previousDebounce;
    envManager.switchToBackground();
    lynx.getCoreContext().removeEventListener(ElementTemplateLifecycleConstant.hydrate, onHydrate);
    resetElementTemplateHydrationListener();

    envManager.switchToMainThread();
    lynx.getJSContext().removeEventListener(ElementTemplateLifecycleConstant.update, onUpdate);
    resetElementTemplatePatchListener();

    envManager.setUseElementTemplate(false);
    cleanup();
    (__root as { __jsx?: unknown }).__jsx = undefined;
  }
}
