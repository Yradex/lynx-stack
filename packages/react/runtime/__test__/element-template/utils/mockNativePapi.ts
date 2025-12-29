// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { vi } from 'vitest';

// Basic deep clone
function clone(obj: any): any {
  return JSON.parse(JSON.stringify(obj));
}

const templateRepo = new Map<string, any>();

export function registerTemplates(templates: any[]): void {
  for (const t of templates) {
    // The key is templateId, value is compiledTemplate
    templateRepo.set(t.templateId, t.compiledTemplate);
  }
}

export function clearTemplates(): void {
  templateRepo.clear();
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
    // Ensure parts/slots structure exists if not present in JSON (though JSON usually has them implicitly via structure)
    // Our JSON has 'attributes' and 'children'. We need to map them to 'parts' and 'slots' for consistency?
    // Or we should update the test expectation to match what the 'real' JSON looks like + what we add.
    // The user wants "real compiled Element Template JSON".
    // The JSON structure from `fixture.spec.js` is:
    // { tag: 'view', attributes: {...}, children: [...] }
    // It DOES NOT have `parts` or `slots` map at the top level.
    // `parts` concept in my previous mock was for *dynamic* props.
    // `slots` concept was for *dynamic* children.
    // So here "Hydration" means:
    // - Iterate opcodes.
    // - If SetAttr (4, partId, attrs): Find the node in `element` that has 'part-id': partId. Merge attrs.
    // - If InsertChild (2, slotId, child): Find the node in `element` that is a 'slot' with 'part-id' or 'name' == slotId. REPLACE it with children? Or append?
    //   Actually, slots in ET are placeholders. We usually replace the <slot> element with the content.

    // For simplicity in this iteration:
    // We will perform a simple hydration strategy:
    // - We will look for `part-id` in the cloned tree.
    // - We need a helper to find nodes by part-id.

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
            // Also merge into `props` if we want to expose it that way, but let's stick to modifying the node structure
            // or maybe converting attributes to props if that's what assertions expect.
            // The previous test expected `parts` map. The new "Full Integration" might prefer asserting the final tree structure directly.
            // Let's attach a `parts` debug property to the root if needed, but modifying the tree in place is more "real".
            // HOWEVER, the `renderOpcodesIntoElementTemplate` test expects specific `parts` field on the root.
            // To stay compatible with existing tests, I should perform the *Mock* logic if it's not in repo,
            // and the *Real* logic if it IS in repo.
            // For new tests using real repo, I should assert the tree structure (nodes with attributes).
          }
          i += 3;
        } else if (opcode === 2) { // InsertChild: [2, slotId, null, child]
          const slotId = opcodes[i + 1];
          const child = opcodes[i + 3];
          // The Slot in JSON is likely a node with tag 'slot' and attributes['part-id'] == slotId
          // Or maybe 'name' == slotId.
          // In fixture it showed: { tag: 'slot', attributes: { 'part-id': 0 } }
          const target = nodesByPartId.get(slotId);
          if (target && target.tag === 'slot') {
            // Replace slot with child(ren)?
            // Usually <slot> is replaced by the content.
            // Since `element` is a tree of plain objects, we need to find the parent of the slot to replace it.
            // This is getting complex for a simple map.
            // Maybe just appending to a `children` array of the slot node is easier for inspection?
            // Let's set `target.children = [child]` (or append).
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
      vi.unstubAllGlobals();
      clearTemplates();
    },
  };
}

export function serializeToJSX(element: any, indent: string = ''): string {
  if (!element) return '';
  if (element.type === 'rawText') {
    return `${indent}<raw-text text="${element.text}" />`;
  }

  let tag = element.tag || element.type || 'unknown';
  let attributes = { ...(element.attributes || element.parts || element.props || {}) };
  const children = element.children || [];
  const slots = element.slots || {};

  const allChildren: any[] = [...children];
  Object.keys(slots).sort().forEach(slotId => {
    allChildren.push(...slots[slotId]);
  });

  if (tag === 'slot') {
    return allChildren
      .map((child) => serializeToJSX(child, indent))
      .filter(Boolean)
      .join('\n');
  }

  const attrStr = Object.entries(attributes)
    .map(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        return ` ${key}={${JSON.stringify(value)}}`;
      }
      return ` ${key}="${value}"`;
    })
    .join('');

  if (allChildren.length === 0) {
    return `${indent}<${tag}${attrStr} />`;
  }

  const childrenStr = allChildren
    .map((child) => serializeToJSX(child, indent + '  '))
    .join('\n');

  return `${indent}<${tag}${attrStr}>\n${childrenStr}\n${indent}</${tag}>`;
}
