// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { afterEach, vi } from 'vitest';

// removed context import
import {
  formatNode,
  instantiateCompiledTemplate,
  isRecordForMock,
  isUnknownArrayForMock,
  insertNodeIntoTemplateInstance,
  removeNodeFromTemplateInstance,
  serializeTemplateInstance,
  setAttributeSlotOnTemplateInstance,
} from './mockNativePapi/templateTree.js';
import type { CompiledTemplateNode } from './mockNativePapi/templateTree.js';
import { clearTemplates, templateRepo } from '../debug/registry.js';

const isRecord = isRecordForMock;
const isUnknownArray = isUnknownArrayForMock;

export interface MockNativePapi {
  nativeLog: any[];
  mockCreateElementTemplate: any;
  mockSerializeElementTemplate: any;
  mockSetAttributeOfElementTemplate: any;
  mockInsertNodeToElementTemplate: any;
  mockRemoveNodeFromElementTemplate: any;
  mockReportError: any;
  mockFlushElementTree: any;
  mockCreatePage: any;
  mockAppendElement: any;
  cleanup: () => void;
}

export interface InstallMockNativePapiOptions {
  clearTemplatesOnCleanup?: boolean;
}

export let lastMock: MockNativePapi | undefined;
let isCleanupRegistered = false;

export function installMockNativePapi(
  options: InstallMockNativePapiOptions = {},
): MockNativePapi {
  const { clearTemplatesOnCleanup = false } = options;
  const nativeLog: any[] = [];
  // context setup moved to installThreadContexts

  const mockCreateElementTemplate = vi.fn().mockImplementation((
    templateKey: string,
    bundleUrl: string | null | undefined,
    attributeSlots: unknown[] | null | undefined,
    elementSlots: unknown[][] | null | undefined,
    options: unknown,
  ) => {
    nativeLog.push(['__CreateElementTemplate', templateKey, bundleUrl, attributeSlots, elementSlots, options]);

    if (!templateRepo.has(templateKey)) {
      throw new Error(
        `ElementTemplate: Template '${templateKey}' not found in registry. Please register it using __REGISTER_ELEMENT_TEMPLATES__ before rendering.`,
      );
    }

    const template = templateRepo.get(templateKey) as unknown;
    const element = instantiateCompiledTemplate(template, attributeSlots, elementSlots);
    element.templateId = templateKey;
    Object.defineProperty(element, '__compiledTemplate', {
      value: template,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(element, '__attributeSlots', {
      value: attributeSlots ?? null,
      writable: true,
      configurable: true,
    });
    if (isRecord(options)) {
      Object.defineProperty(element, '__options', {
        value: { ...options },
        writable: true,
        configurable: true,
      });
    }
    if (isRecord(options) && typeof options['handleId'] === 'number') {
      Object.defineProperty(element, '__handleId', {
        value: options['handleId'],
        writable: true,
        configurable: true,
      });
    }
    return element;
  });

  const mockSerializeElementTemplate = vi.fn().mockImplementation((templateInstance: unknown) => {
    return serializeTemplateInstance(templateInstance);
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

  const mockSetAttributeOfElementTemplate = vi.fn().mockImplementation(
    (nativeRef: unknown, attrSlotIndex: number, value: unknown, options: unknown) => {
      nativeLog.push([
        '__SetAttributeOfElementTemplate',
        formatNode(nativeRef),
        attrSlotIndex,
        value,
        options,
      ]);
      if (isRecord(nativeRef)) {
        setAttributeSlotOnTemplateInstance(nativeRef as CompiledTemplateNode, attrSlotIndex, value);
      }
    },
  );

  const mockInsertNodeToElementTemplate = vi.fn().mockImplementation(
    (nativeRef: unknown, elementSlotIndex: number, node: unknown, referenceNode: unknown) => {
      nativeLog.push([
        '__InsertNodeToElementTemplate',
        formatNode(nativeRef),
        elementSlotIndex,
        formatNode(node),
        referenceNode == null ? null : formatNode(referenceNode),
      ]);
      if (isRecord(nativeRef)) {
        insertNodeIntoTemplateInstance(
          nativeRef as CompiledTemplateNode,
          elementSlotIndex,
          node,
          referenceNode,
        );
      }
    },
  );

  const mockRemoveNodeFromElementTemplate = vi.fn().mockImplementation(
    (nativeRef: unknown, elementSlotIndex: number, node: unknown) => {
      nativeLog.push([
        '__RemoveNodeFromElementTemplate',
        formatNode(nativeRef),
        elementSlotIndex,
        formatNode(node),
      ]);
      if (isRecord(nativeRef)) {
        removeNodeFromTemplateInstance(nativeRef as CompiledTemplateNode, elementSlotIndex, node);
      }
    },
  );

  const mockFlushElementTree = vi.fn().mockImplementation((element: unknown, options: unknown) => {
    nativeLog.push(['__FlushElementTree', formatNode(element), options]);
  });

  vi.stubGlobal('__CreateElementTemplate', mockCreateElementTemplate);
  vi.stubGlobal('__CreatePage', mockCreatePage);
  vi.stubGlobal('__AppendElement', mockAppendElement);
  vi.stubGlobal('__SetAttributeOfElementTemplate', mockSetAttributeOfElementTemplate);
  vi.stubGlobal('__InsertNodeToElementTemplate', mockInsertNodeToElementTemplate);
  vi.stubGlobal('__RemoveNodeFromElementTemplate', mockRemoveNodeFromElementTemplate);
  vi.stubGlobal('__SerializeElementTemplate', mockSerializeElementTemplate);
  vi.stubGlobal('__FlushElementTree', mockFlushElementTree);
  const currentLynx = (globalThis as unknown as { lynx?: any }).lynx;
  const baseLynx = (currentLynx && typeof currentLynx === 'object') ? currentLynx : {};
  vi.stubGlobal('lynx', {
    ...baseLynx,
    reportError: mockReportError,
  });

  const result: MockNativePapi = {
    nativeLog: nativeLog,
    mockCreateElementTemplate: mockCreateElementTemplate,
    mockSerializeElementTemplate: mockSerializeElementTemplate,
    mockSetAttributeOfElementTemplate: mockSetAttributeOfElementTemplate,
    mockInsertNodeToElementTemplate: mockInsertNodeToElementTemplate,
    mockRemoveNodeFromElementTemplate: mockRemoveNodeFromElementTemplate,
    mockReportError: mockReportError,
    mockFlushElementTree: mockFlushElementTree,
    mockCreatePage: mockCreatePage,
    mockAppendElement: mockAppendElement,
    cleanup: (): void => {
      const errorCalls = mockReportError.mock.calls;
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

  lastMock = result;
  if (!isCleanupRegistered) {
    isCleanupRegistered = true;
    afterEach(() => {
      lastMock?.cleanup();
    });
  }

  return result;
}
