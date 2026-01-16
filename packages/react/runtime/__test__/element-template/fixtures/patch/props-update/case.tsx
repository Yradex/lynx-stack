import { hydrate as hydrateBackground } from '../../../../../src/element-template/background/hydrate.js';
import {
  GlobalCommitContext,
  resetGlobalCommitContext,
} from '../../../../../src/element-template/background/commit-context.js';
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
  lynx.getCoreContext().addEventListener(ElementTemplateLifecycleConstant.hydrate, onHydrate);
  lynx.getJSContext().addEventListener(ElementTemplateLifecycleConstant.update, onUpdate);
  installElementTemplateHydrationListener();
  installElementTemplatePatchListener();

  try {
    function Child({ label }: { label: string }) {
      return <view attrs={{ 0: { id: label } }} />;
    }

    function App({ label }: { label: string }) {
      return <Child label={label} />;
    }

    root.render(<App label='before' />);
    envManager.switchToMainThread();
    renderPage();
    const beforePageJsx = serializeToJSX(__page);
    updateEvents.length = 0;

    envManager.switchToBackground();

    if (hydrationData.length === 0) {
      throw new Error('Missing hydration payload.');
    }

    resetGlobalCommitContext();
    root.render(<App label='after' />);

    const patches = [...GlobalCommitContext.patches];
    const flushOptions = { ...GlobalCommitContext.flushOptions };
    resetGlobalCommitContext();

    if (patches.length > 0) {
      lynx.getCoreContext().dispatchEvent({
        type: ElementTemplateLifecycleConstant.update,
        data: { patches, flushOptions },
      });
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
    lynx.getCoreContext().removeEventListener(ElementTemplateLifecycleConstant.hydrate, onHydrate);
    lynx.getJSContext().removeEventListener(ElementTemplateLifecycleConstant.update, onUpdate);
    resetElementTemplateHydrationListener();
    resetElementTemplatePatchListener();
    envManager.setUseElementTemplate(false);
    cleanup();
    (__root as { __jsx?: unknown }).__jsx = undefined;
  }
}
