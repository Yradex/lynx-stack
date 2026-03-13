// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { hydrate as hydrateBackground } from '../../../../src/element-template/background/hydrate.js';
import type { BackgroundElementTemplateInstance } from '../../../../src/element-template/background/instance.js';
import { root } from '../../../../src/element-template/index.js';
import { ElementTemplateLifecycleConstant } from '../../../../src/element-template/protocol/lifecycle-constant.js';
import type {
  ElementTemplateUpdateCommandStream,
  SerializedElementTemplate,
} from '../../../../src/element-template/protocol/types.js';
import { applyElementTemplateUpdateCommands } from '../../../../src/element-template/runtime/patch.js';
import { __page } from '../../../../src/element-template/runtime/page/page.js';
import { __root } from '../../../../src/element-template/runtime/page/root-instance.js';
import { ElementTemplateEnvManager } from './envManager.js';
import { lastMock } from '../mock/mockNativePapi.js';
import { formatUpdateCommands } from '../mock/mockNativePapi/templateTree.js';
import { serializeBackgroundTree, serializeToJSX } from './serializer.js';

declare const renderPage: () => void;

type FormattedUpdateEntry =
  | {
    type: 'create';
    id: number;
    template: string;
    attributeSlots: unknown;
    elementSlots: unknown;
  }
  | {
    type: 'setAttribute';
    id: number;
    attrSlotIndex: number;
    value: unknown;
  }
  | {
    type: 'insertNode';
    id: number;
    elementSlotIndex: number;
    child: unknown;
    reference: unknown;
  }
  | {
    type: 'removeNode';
    id: number;
    elementSlotIndex: number;
    child: unknown;
  };

export interface UpdateRunOptions {
  render: () => JSX.Element;
  update: () => void;
}

export interface UpdateRunResult {
  beforePageJsx: string;
  afterPageJsx: string;
  backgroundJsx: string;
  ops: ElementTemplateUpdateCommandStream;
  formattedOps: FormattedUpdateEntry[];
  updateNativeLog: unknown[];
  formattedNativeLog: unknown[];
}

export function formatUpdateStream(stream: ElementTemplateUpdateCommandStream): FormattedUpdateEntry[] {
  const formatted: FormattedUpdateEntry[] = [];
  let index = 0;
  while (index < stream.length) {
    const opcode = stream[index++] as number;
    if (opcode === 1) {
      formatted.push({
        type: 'create',
        id: stream[index++] as number,
        template: stream[index++] as string,
        attributeSlots: stream[index + 1] as unknown,
        elementSlots: stream[index + 2] as unknown,
      });
      index += 3;
      continue;
    }

    if (opcode === 2) {
      formatted.push({
        type: 'setAttribute',
        id: stream[index++] as number,
        attrSlotIndex: stream[index++] as number,
        value: stream[index++] as unknown,
      });
      continue;
    }

    if (opcode === 3) {
      formatted.push({
        type: 'insertNode',
        id: stream[index++] as number,
        elementSlotIndex: stream[index++] as number,
        child: stream[index++] as unknown,
        reference: stream[index++] as unknown,
      });
      continue;
    }

    formatted.push({
      type: 'removeNode',
      id: stream[index++] as number,
      elementSlotIndex: stream[index++] as number,
      child: stream[index++] as unknown,
    });
  }
  return formatted;
}

export function formatNativePatchLog(nativeLog: unknown[]): unknown[] {
  return nativeLog.map((entry) => {
    if (!Array.isArray(entry)) {
      return entry;
    }
    if (
      entry[0] === '__SetAttributeOfElementTemplate'
      || entry[0] === '__InsertNodeToElementTemplate'
      || entry[0] === '__RemoveNodeFromElementTemplate'
    ) {
      return entry;
    }
    return entry;
  });
}

export function runElementTemplateUpdate(options: UpdateRunOptions): UpdateRunResult {
  const envManager = new ElementTemplateEnvManager();
  const nativeLog = lastMock!.nativeLog;
  const hydrationData: SerializedElementTemplate[] = [];

  const onHydrate = (event: { data: unknown }) => {
    const data = event.data;
    if (Array.isArray(data)) {
      for (const item of data) {
        hydrationData.push(item as SerializedElementTemplate);
      }
    }
  };

  envManager.resetEnv('background');
  envManager.setUseElementTemplate(true);
  lynx.getCoreContext().addEventListener(ElementTemplateLifecycleConstant.hydrate, onHydrate);

  try {
    root.render(options.render());
    envManager.switchToMainThread();
    root.render(options.render());
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

    const ops = hydrateBackground(before, afterBackground);

    envManager.switchToMainThread();
    if (ops.length > 0) {
      applyElementTemplateUpdateCommands(ops);
    }

    const afterPageJsx = serializeToJSX(__page);
    const updateNativeLog = nativeLog.slice(nativeLogStart);

    return {
      beforePageJsx,
      afterPageJsx,
      backgroundJsx: serializeBackgroundTree(afterBackground),
      ops,
      formattedOps: formatUpdateStream(ops),
      updateNativeLog,
      formattedNativeLog: formatNativePatchLog(updateNativeLog),
    };
  } finally {
    envManager.switchToBackground();
    lynx.getCoreContext().removeEventListener(ElementTemplateLifecycleConstant.hydrate, onHydrate);
    envManager.setUseElementTemplate(false);
    // cleanup is automatic
  }
}
