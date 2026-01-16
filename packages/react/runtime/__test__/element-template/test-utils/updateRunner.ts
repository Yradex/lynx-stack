// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { hydrate as hydrateBackground } from '../../../src/element-template/background/hydrate.js';
import type { BackgroundElementTemplateInstance } from '../../../src/element-template/background/instance.js';
import { root } from '../../../src/element-template/index.js';
import { ElementTemplateLifecycleConstant } from '../../../src/element-template/protocol/lifecycle-constant.js';
import type { ElementTemplatePatchStream, SerializedETInstance } from '../../../src/element-template/protocol/types.js';
import { applyElementTemplatePatches } from '../../../src/element-template/runtime/patch.js';
import { __page } from '../../../src/element-template/runtime/page/page.js';
import { __root } from '../../../src/element-template/runtime/page/root-instance.js';
import { ElementTemplateEnvManager } from './envManager.js';
import { installMockNativePapi } from './mockNativePapi.js';
import { formatOpcodes } from './mockNativePapi/templateTree.js';
import { serializeBackgroundTree, serializeToJSX } from './serializer.js';

declare const renderPage: () => void;

type FormattedPatchEntry =
  | {
    type: 'create';
    id: number;
    template: string;
    init: unknown;
  }
  | {
    type: 'patch';
    id: number;
    opcodes: unknown;
  };

export interface UpdateRunOptions {
  render: () => JSX.Element;
  update: () => void;
}

export interface UpdateRunResult {
  beforePageJsx: string;
  afterPageJsx: string;
  backgroundJsx: string;
  patches: ElementTemplatePatchStream;
  formattedPatches: FormattedPatchEntry[];
  updateNativeLog: unknown[];
  formattedNativeLog: unknown[];
}

export function formatPatchStream(stream: ElementTemplatePatchStream): FormattedPatchEntry[] {
  const formatted: FormattedPatchEntry[] = [];
  let index = 0;
  while (index < stream.length) {
    const header = stream[index++] as number;
    if (header === 0) {
      const id = stream[index++] as number;
      const template = stream[index++] as string;
      const initPayload = stream[index++] as unknown;
      const init = Array.isArray(initPayload) ? formatOpcodes(initPayload) : initPayload;
      formatted.push({ type: 'create', id, template, init });
    } else {
      const id = header;
      const opcodes = stream[index++] as unknown;
      formatted.push({ type: 'patch', id, opcodes: formatOpcodes(opcodes) });
    }
  }
  return formatted;
}

export function formatNativePatchLog(nativeLog: unknown[]): unknown[] {
  return nativeLog.map((entry) => {
    if (!Array.isArray(entry)) {
      return entry;
    }
    if (entry[0] === '__PatchElementTemplate') {
      const [, node, opcodes, config] = entry;
      return ['__PatchElementTemplate', node, formatOpcodes(opcodes), config];
    }
    return entry;
  });
}

export function runElementTemplateUpdate(options: UpdateRunOptions): UpdateRunResult {
  const envManager = new ElementTemplateEnvManager();
  const { nativeLog, cleanup } = installMockNativePapi({ clearTemplatesOnCleanup: false });
  const hydrationData: SerializedETInstance[] = [];

  const onHydrate = (event: { data: unknown }) => {
    const data = event.data;
    if (Array.isArray(data)) {
      for (const item of data) {
        hydrationData.push(item as SerializedETInstance);
      }
    }
  };

  envManager.resetEnv('background');
  envManager.setUseElementTemplate(true);
  lynx.getCoreContext().addEventListener(ElementTemplateLifecycleConstant.hydrate, onHydrate);

  try {
    root.render(options.render());
    envManager.switchToMainThread();
    renderPage();
    const beforePageJsx = serializeToJSX(__page);
    envManager.switchToBackground();

    const before = hydrationData[0];
    if (!before) {
      throw new Error('Missing hydration data.');
    }

    const backgroundRoot = __root as BackgroundElementTemplateInstance;
    const beforeBackground = backgroundRoot.firstChild;
    if (!beforeBackground) {
      throw new Error('Missing background root child.');
    }

    const nativeLogStart = nativeLog.length;
    options.update();

    const afterBackground = backgroundRoot.firstChild;
    if (!afterBackground) {
      throw new Error('Missing background root child.');
    }

    const patches = hydrateBackground(before, afterBackground);

    envManager.switchToMainThread();
    if (patches.length > 0) {
      applyElementTemplatePatches(patches);
    }

    const afterPageJsx = serializeToJSX(__page);
    const updateNativeLog = nativeLog.slice(nativeLogStart);

    return {
      beforePageJsx,
      afterPageJsx,
      backgroundJsx: serializeBackgroundTree(afterBackground),
      patches,
      formattedPatches: formatPatchStream(patches),
      updateNativeLog,
      formattedNativeLog: formatNativePatchLog(updateNativeLog),
    };
  } finally {
    lynx.getCoreContext().removeEventListener(ElementTemplateLifecycleConstant.hydrate, onHydrate);
    envManager.setUseElementTemplate(false);
    cleanup();
  }
}
