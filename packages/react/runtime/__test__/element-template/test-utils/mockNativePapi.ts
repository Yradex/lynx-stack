// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { vi } from 'vitest';

import { clearTemplates, templateRepo } from './registry.js';

// Basic deep clone
function clone(obj: any): any {
  return JSON.parse(JSON.stringify(obj));
}

export interface MockNativePapi {
  nativeLog: any[];
  mockElementFromBinary: any;
  mockCreateRawText: any;
  mockReportError: any;
  cleanup: () => void;
}

export function installMockNativePapi(): MockNativePapi {
  const nativeLog: any[] = [];

  const mockElementFromBinary = vi.fn().mockImplementation((...args: any[]) => {
    const [tag, component, opcodes, config] = args;

    const formatOpcodes = (ops: any[]) => {
      if (!Array.isArray(ops)) return ops;
      const res = [];
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
        } else {
          res.push(opcode);
          i++;
        }
      }
      return res;
    };

    nativeLog.push(['__ElementFromBinary', tag, component, formatOpcodes(opcodes), config]);

    if (!templateRepo.has(tag)) {
      throw new Error(
        `ElementTemplate: Template '${tag}' not found in registry. Please register it using __REGISTER_ELEMENT_TEMPLATES__ before rendering.`,
      );
    }

    // 1. Try to find in repo
    let element: any;
    const template = templateRepo.get(tag);
    element = clone(template); // Deep clone base template (children, tag, static props)

    // Let's implement a basic `findNodeByPartId`
    const nodesByPartId = new Map<number, any>();
    const collectNodes = (node: any) => {
      if (node.attributes && node.attributes['part-id'] !== undefined) {
        nodesByPartId.set(Number(node.attributes['part-id']), node);
      }
      if (node.children) {
        node.children.forEach(collectNodes);
      }
    };
    collectNodes(element);

    if (opcodes && Array.isArray(opcodes)) {
      for (let i = 0; i < opcodes.length;) {
        const opcode = opcodes[i];
        if (opcode === 4) { // SetAttribute: [4, partId, attrs]
          const partId = opcodes[i + 1];
          const attrs = opcodes[i + 2];
          const target = nodesByPartId.get(partId);
          if (target) {
            Object.assign(target.attributes, attrs);
          }
          i += 3;
        } else if (opcode === 2) { // InsertChild: [2, slotId, null, child]
          const slotId = opcodes[i + 1];
          const child = opcodes[i + 3];
          const target = nodesByPartId.get(slotId);
          if (target && target.tag === 'slot') {
            if (!target.children) target.children = [];
            target.children.push(child);
          }
          i += 4;
        } else {
          i++;
        }
      }
    }
    element.templateId = tag;

    return element;
  });

  const mockCreateRawText = vi.fn().mockImplementation((text: string) => {
    nativeLog.push(['__CreateRawText', text]);
    return { type: 'rawText', text }; // Matches existing structure
  });

  const mockReportError = vi.fn().mockImplementation((error: Error) => {
    const g: any = globalThis as any;
    if (!g.__LYNX_REPORT_ERROR_CALLS) {
      g.__LYNX_REPORT_ERROR_CALLS = [];
    }
    g.__LYNX_REPORT_ERROR_CALLS.push(error);
    nativeLog.push(['lynx.reportError', error]);
  });

  const mockCreatePage = vi.fn().mockImplementation((id: string, cssId: number) => {
    nativeLog.push(['__CreatePage', id, cssId]);
    return { type: 'page', id, cssId };
  });

  const mockAppendElement = vi.fn().mockImplementation((parent: any, child: any) => {
    const format = (node: any) => {
      if (typeof node === 'string') {
        return node;
      }
      if (node.templateId || node.tag) {
        return `<${node.templateId || node.tag} />`;
      }
      if (node.text) {
        return `"${node.text}"`;
      }
      return node.id || node.type || String(node);
    };
    const parentId = format(parent);
    const childId = format(child);
    nativeLog.push(['__AppendElement', parentId, childId]);
    if (!parent.children) {
      parent.children = [];
    }
    parent.children.push(child);
  });

  vi.stubGlobal('__ElementFromBinary', mockElementFromBinary);
  vi.stubGlobal('__CreateRawText', mockCreateRawText);
  vi.stubGlobal('__CreatePage', mockCreatePage);
  vi.stubGlobal('__AppendElement', mockAppendElement);
  vi.stubGlobal('lynx', {
    reportError: mockReportError,
  });

  return {
    nativeLog: nativeLog,
    mockElementFromBinary: mockElementFromBinary,
    mockCreateRawText: mockCreateRawText,
    mockReportError: mockReportError,
    cleanup: (): void => {
      const errorCalls = mockReportError.mock.calls;
      vi.unstubAllGlobals();
      clearTemplates();

      if (errorCalls.length > 0) {
        throw new Error(
          `lynx.reportError was called ${errorCalls.length} times:\n`
            + errorCalls
              .map((call: any[]) =>
                call
                  .map((arg) =>
                    arg instanceof Error
                      ? (arg.stack || arg.message)
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
