// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { vi } from 'vitest';

import { createCrossThreadContextPair } from './mockNativePapi/context.js';
import {
  applyOpcodesToTemplateInstance,
  clone,
  formatNode,
  formatOpcodes,
  isRecordForMock,
  isUnknownArrayForMock,
} from './mockNativePapi/templateTree.js';
import type { CompiledTemplateNode } from './mockNativePapi/templateTree.js';
import { clearTemplates, templateRepo } from '../debug/registry.js';

const isRecord = isRecordForMock;
const isUnknownArray = isUnknownArrayForMock;

export interface MockNativePapi {
  nativeLog: any[];
  mockElementFromBinary: any;
  mockCreateRawText: any;
  mockPatchElementTemplate: any;
  mockReportError: any;
  mockFlushElementTree: any;
  cleanup: () => void;
}

export interface InstallMockNativePapiOptions {
  clearTemplatesOnCleanup?: boolean;
}

export function installMockNativePapi(
  options: InstallMockNativePapiOptions = {},
): MockNativePapi {
  const { clearTemplatesOnCleanup = true } = options;
  const nativeLog: any[] = [];
  const { jsContext, coreContext, checkListenerLeaks } = createCrossThreadContextPair();

  const mockElementFromBinary = vi.fn().mockImplementation((...args: unknown[]) => {
    const tag = args[0];
    const component = args[1];
    const opcodes = args[2];
    const config = args[3];

    if (typeof tag !== 'string') {
      throw new Error(`ElementTemplate: __ElementFromBinary tag must be string, got '${String(tag)}'.`);
    }

    nativeLog.push(['__ElementFromBinary', tag, component, formatOpcodes(opcodes), config]);

    if (!templateRepo.has(tag)) {
      throw new Error(
        `ElementTemplate: Template '${tag}' not found in registry. Please register it using __REGISTER_ELEMENT_TEMPLATES__ before rendering.`,
      );
    }

    // 1. Try to find in repo
    const template = templateRepo.get(tag) as unknown;
    const element = clone(template) as CompiledTemplateNode; // Deep clone base template (children, tag, static props)

    applyOpcodesToTemplateInstance(element, opcodes);
    element.templateId = tag;

    return element;
  });

  const mockCreateRawText = vi.fn().mockImplementation((text: string) => {
    nativeLog.push(['__CreateRawText', text]);
    return { type: 'rawText', text }; // Matches existing structure
  });

  const mockReportError = vi.fn().mockImplementation((error: Error) => {
    const g = globalThis as unknown as { __LYNX_REPORT_ERROR_CALLS?: Error[] };
    g.__LYNX_REPORT_ERROR_CALLS ??= [];
    g.__LYNX_REPORT_ERROR_CALLS.push(error);
    nativeLog.push(['lynx.reportError', error]);
  });

  const mockCreatePage = vi.fn().mockImplementation((id: string, cssId: number) => {
    nativeLog.push(['__CreatePage', id, cssId]);
    return { type: 'page', id, cssId };
  });

  const mockAppendElement = vi.fn().mockImplementation((parent: unknown, child: unknown) => {
    const parentId = formatNode(parent);
    const childId = formatNode(child);
    nativeLog.push(['__AppendElement', parentId, childId]);
    if (isRecord(parent)) {
      const children = parent['children'];
      if (isUnknownArray(children)) {
        children.push(child);
      } else {
        parent['children'] = [child];
      }
    }
  });

  const mockPatchElementTemplate = vi.fn().mockImplementation(
    (nativeRef: unknown, opcodes: unknown, config: unknown) => {
      nativeLog.push(['__PatchElementTemplate', formatNode(nativeRef), opcodes, config]);
      if (isRecord(nativeRef)) {
        applyOpcodesToTemplateInstance(nativeRef as CompiledTemplateNode, opcodes);
      }
    },
  );

  const mockFlushElementTree = vi.fn().mockImplementation((element: unknown, options: unknown) => {
    nativeLog.push(['__FlushElementTree', formatNode(element), options]);
  });

  vi.stubGlobal('__ElementFromBinary', mockElementFromBinary);
  vi.stubGlobal('__CreateRawText', mockCreateRawText);
  vi.stubGlobal('__CreatePage', mockCreatePage);
  vi.stubGlobal('__AppendElement', mockAppendElement);
  vi.stubGlobal('__PatchElementTemplate', mockPatchElementTemplate);
  vi.stubGlobal('__FlushElementTree', mockFlushElementTree);
  const previousLynx = (globalThis as unknown as { lynx?: unknown }).lynx;
  const baseLynx = isRecord(previousLynx) ? previousLynx : {};
  vi.stubGlobal('lynx', {
    ...baseLynx,
    reportError: mockReportError,
    getJSContext: () => {
      return jsContext;
    },
    getCoreContext: () => {
      return coreContext;
    },
  });

  return {
    nativeLog: nativeLog,
    mockElementFromBinary: mockElementFromBinary,
    mockCreateRawText: mockCreateRawText,
    mockPatchElementTemplate: mockPatchElementTemplate,
    mockReportError: mockReportError,
    mockFlushElementTree: mockFlushElementTree,
    cleanup: (): void => {
      checkListenerLeaks();
      const errorCalls = mockReportError.mock.calls;
      vi.unstubAllGlobals();
      if (clearTemplatesOnCleanup) {
        clearTemplates();
      }

      if (errorCalls.length > 0) {
        throw new Error(
          `lynx.reportError was called ${errorCalls.length} times:\n`
            + errorCalls
              .map((call: any[]) =>
                call
                  .map((arg) =>
                    arg instanceof Error
                      ? (arg.stack ?? arg.message)
                      : JSON.stringify(arg)
                  )
                  .join(' ')
              )
              .join('\n'),
        );
      }
    },
  };
}
