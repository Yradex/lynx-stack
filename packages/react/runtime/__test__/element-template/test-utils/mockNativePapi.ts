// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { vi } from 'vitest';

import { clearTemplates, templateRepo } from './registry.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

interface CompiledTemplateNode {
  tag?: string;
  templateId?: string;
  attributes?: Record<string, unknown>;
  parts?: Record<string, unknown>;
  children?: unknown[];
  type?: string;
  text?: string;
}

function getPartId(node: Record<string, unknown>): number | undefined {
  const attrs = node['attributes'];
  if (isRecord(attrs)) {
    const partId = attrs['part-id'];
    if (typeof partId === 'string' || typeof partId === 'number') {
      return Number(partId);
    }
  }

  const parts = node['parts'];
  if (isRecord(parts)) {
    const partId = parts['part-id'];
    if (typeof partId === 'string' || typeof partId === 'number') {
      return Number(partId);
    }
  }

  return undefined;
}

function getNodeAttrsForWrite(node: CompiledTemplateNode): Record<string, unknown> {
  if (isRecord(node.attributes)) {
    return node.attributes;
  }
  node.attributes = {};
  return node.attributes;
}

function collectNodesByPartId(root: unknown): Map<number, CompiledTemplateNode> {
  const nodesByPartId = new Map<number, CompiledTemplateNode>();

  const collect = (node: unknown) => {
    if (!isRecord(node)) {
      return;
    }

    const partId = getPartId(node);
    if (typeof partId === 'number') {
      nodesByPartId.set(partId, node as CompiledTemplateNode);
    }

    if (node !== root && typeof node['templateId'] === 'string') {
      return;
    }

    const children = node['children'];
    if (isUnknownArray(children)) {
      for (const child of children) {
        collect(child);
      }
    }
  };

  collect(root);
  return nodesByPartId;
}

function applyOpcodesToTemplateInstance(root: CompiledTemplateNode, opcodes: unknown): void {
  if (!isUnknownArray(opcodes)) {
    return;
  }

  const nodesByPartId = collectNodesByPartId(root);

  for (let i = 0; i < opcodes.length;) {
    const opcode = opcodes[i];

    if (opcode === 4) {
      const partId = opcodes[i + 1];
      const patch = opcodes[i + 2];
      const target = (typeof partId === 'string' || typeof partId === 'number')
        ? nodesByPartId.get(Number(partId))
        : undefined;
      if (target && isRecord(patch)) {
        const attrs = getNodeAttrsForWrite(target);
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined) {
            delete attrs[key];
          } else {
            attrs[key] = value;
          }
        }
      }
      i += 3;
      continue;
    }

    if (opcode === 2) {
      const slotId = opcodes[i + 1];
      const beforeRef = opcodes[i + 2];
      const childRef = opcodes[i + 3];

      const slot = (typeof slotId === 'string' || typeof slotId === 'number')
        ? nodesByPartId.get(Number(slotId))
        : undefined;

      if (!slot || slot.tag !== 'slot' || childRef == null) {
        i += 4;
        continue;
      }

      slot.children ??= [];
      const list = slot.children;

      const existingIndex = list.indexOf(childRef);
      if (existingIndex >= 0) {
        list.splice(existingIndex, 1);
      }

      if (beforeRef == null) {
        list.push(childRef);
      } else {
        const beforeIndex = list.indexOf(beforeRef);
        if (beforeIndex >= 0) {
          list.splice(beforeIndex, 0, childRef);
        } else {
          list.push(childRef);
        }
      }

      i += 4;
      continue;
    }

    if (opcode === 3) {
      const slotId = opcodes[i + 1];
      const childRef = opcodes[i + 2];
      const slot = (typeof slotId === 'string' || typeof slotId === 'number')
        ? nodesByPartId.get(Number(slotId))
        : undefined;

      if (slot?.tag === 'slot' && slot.children && childRef != null) {
        const index = slot.children.indexOf(childRef);
        if (index >= 0) {
          slot.children.splice(index, 1);
        }
      }

      i += 3;
      continue;
    }

    i += 1;
  }
}

function formatOpcodes(ops: unknown): unknown {
  if (!isUnknownArray(ops)) return ops;
  const res: unknown[] = [];
  for (let i = 0; i < ops.length;) {
    const opcode = ops[i];
    if (opcode === 4) { // setAttributes
      res.push({
        type: 'setAttributes',
        id: ops[i + 1],
        attributes: ops[i + 2],
      });
      i += 3;
    } else if (opcode === 2) { // insertBefore
      res.push({
        type: 'insertBefore',
        id: ops[i + 1],
        node: ops[i + 3],
      });
      i += 4;
    } else if (opcode === 3) { // removeChild
      res.push({
        type: 'removeChild',
        id: ops[i + 1],
        node: ops[i + 2],
      });
      i += 3;
    } else {
      res.push(opcode);
      i += 1;
    }
  }
  return res;
}

function formatNode(node: unknown): string {
  if (typeof node === 'string') {
    return node;
  }
  if (isRecord(node)) {
    const templateId = node['templateId'];
    const tag = node['tag'];
    const displayTag = typeof templateId === 'string'
      ? templateId
      : (typeof tag === 'string' ? tag : undefined);
    if (displayTag) {
      return `<${displayTag} />`;
    }

    const text = node['text'];
    if (typeof text === 'string') {
      return `"${text}"`;
    }

    const id = node['id'];
    if (typeof id === 'string' || typeof id === 'number') {
      return String(id);
    }

    const type = node['type'];
    if (typeof type === 'string') {
      return type;
    }
  }
  return String(node);
}

// Basic deep clone
function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

export interface MockNativePapi {
  nativeLog: any[];
  mockElementFromBinary: any;
  mockCreateRawText: any;
  mockPatchElementTemplate: any;
  mockReportError: any;
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

  vi.stubGlobal('__ElementFromBinary', mockElementFromBinary);
  vi.stubGlobal('__CreateRawText', mockCreateRawText);
  vi.stubGlobal('__CreatePage', mockCreatePage);
  vi.stubGlobal('__AppendElement', mockAppendElement);
  vi.stubGlobal('__PatchElementTemplate', mockPatchElementTemplate);
  vi.stubGlobal('lynx', {
    reportError: mockReportError,
  });

  return {
    nativeLog: nativeLog,
    mockElementFromBinary: mockElementFromBinary,
    mockCreateRawText: mockCreateRawText,
    mockPatchElementTemplate: mockPatchElementTemplate,
    mockReportError: mockReportError,
    cleanup: (): void => {
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
