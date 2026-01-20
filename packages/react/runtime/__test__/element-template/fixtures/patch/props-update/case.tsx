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

declare const renderPage: () => void;

export function run() {
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

  envManager.switchToMainThread();
  lynx.getJSContext().addEventListener(ElementTemplateLifecycleConstant.update, onUpdate);
  installElementTemplatePatchListener();

  envManager.switchToBackground();

  try {
    function Child({ label }: { label: string }) {
      return <view attrs={{ 0: { id: label } }} />;
    }

    function App({ label }: { label: string }) {
      return <Child label={label} />;
    }

    root.render(<App label='before' />);
    envManager.switchToMainThread();
    root.render(<App label='before' />);
    renderPage();
    const beforePageJsx = serializeToJSX(__page);
    updateEvents.length = 0;

    envManager.switchToBackground();

    if (hydrationData.length === 0) {
      throw new Error('Missing hydration payload.');
    }

    resetGlobalCommitContext();
    root.render(<App label='after' />);

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
