import { vi } from 'vitest';

import { renderOpcodesIntoElementTemplate } from '../../../../../src/element-template/runtime/render/render-opcodes.js';
import { resetTemplateId } from '../../../../../src/element-template/runtime/template/handle.js';
import { ElementTemplateRegistry } from '../../../../../src/element-template/runtime/template/registry.js';
import { __OpAttr, __OpBegin, __OpEnd, __OpSlot, __OpText } from '../../../../../src/renderToOpcodes/index.js';
import { installMockNativePapi } from '../../../test-utils/mockNativePapi.js';
import { registerTemplates } from '../../../test-utils/registry.js';

interface RootNode {
  type: 'root';
  children?: unknown[];
}

interface CaseContext {
  root: RootNode;
  nativeLog: unknown[];
  cleanup: () => void;
}

const templates = [
  {
    templateId: '_et_foo',
    compiledTemplate: {
      tag: '_et_foo',
      attributes: { 'part-id': 0 },
      children: [
        { tag: 'slot', attributes: { 'part-id': 0 } },
        { tag: 'slot', attributes: { 'part-id': 1 } },
      ],
    },
  },
  {
    templateId: '_et_parent',
    compiledTemplate: {
      tag: '_et_parent',
      attributes: {},
      children: [{ tag: 'slot', attributes: { 'part-id': 0 } }],
    },
  },
  {
    templateId: '_et_child',
    compiledTemplate: { tag: '_et_child', attributes: {}, children: [] },
  },
  {
    templateId: '_et_outer',
    compiledTemplate: {
      tag: '_et_outer',
      attributes: {},
      children: [{ tag: 'slot', attributes: { 'part-id': 0 } }],
    },
  },
  {
    templateId: '_et_inner',
    compiledTemplate: {
      tag: '_et_inner',
      attributes: { 'part-id': 0 },
      children: [{ tag: 'slot', attributes: { 'part-id': 1 } }],
    },
  },
  {
    templateId: '_et_child_a',
    compiledTemplate: { tag: '_et_child_a', attributes: {}, children: [] },
  },
  {
    templateId: '_et_child_b',
    compiledTemplate: { tag: '_et_child_b', attributes: {}, children: [] },
  },
];

function setup(): CaseContext {
  vi.resetAllMocks();
  ElementTemplateRegistry.clear();
  resetTemplateId();

  const installed = installMockNativePapi();
  registerTemplates(templates);

  return {
    root: { type: 'root' },
    nativeLog: installed.nativeLog,
    cleanup: installed.cleanup,
  };
}

function runCase<T>(runner: (context: CaseContext) => T): T {
  const context = setup();
  try {
    return runner(context);
  } finally {
    context.cleanup();
  }
}

export function run(): Record<string, unknown> {
  return {
    'builds-init-opcodes-from-attrs-and-slot-text': runCase(({ root, nativeLog }) => {
      const opcodes = [
        __OpBegin,
        { type: '_et_foo', props: {} },
        __OpAttr,
        'attrs',
        { 0: { id: 'test' } },
        __OpSlot,
        1,
        __OpText,
        'Hello',
        __OpEnd,
      ];

      renderOpcodesIntoElementTemplate(opcodes, root);

      const registryNode = ElementTemplateRegistry.get(-2)?.nativeRef;
      const rootChild = root.children?.[0];

      return {
        nativeLog,
        registryNode,
        rootChild,
        rootChildMatchesRegistry: rootChild === registryNode,
      };
    }),
    'keeps-slot-children-separated-and-ordered': runCase(({ root, nativeLog }) => {
      const opcodes = [
        __OpBegin,
        { type: '_et_foo', props: {} },
        __OpSlot,
        0,
        __OpText,
        'A',
        __OpSlot,
        1,
        __OpText,
        'B',
        __OpEnd,
      ];

      renderOpcodesIntoElementTemplate(opcodes, root);

      return {
        nativeLog,
        rootChild: root.children?.[0],
      };
    }),
    'inserts-nested-templates-into-parent-slots': runCase(({ root, nativeLog }) => {
      const opcodes = [
        __OpBegin,
        { type: '_et_outer', props: {} },
        __OpSlot,
        0,
        __OpBegin,
        { type: '_et_inner', props: {} },
        __OpAttr,
        'attrs',
        { 0: { id: 'inner' } },
        __OpSlot,
        0,
        __OpText,
        'X',
        __OpEnd,
        __OpEnd,
      ];

      renderOpcodesIntoElementTemplate(opcodes, root);

      return {
        nativeLog,
        rootChild: root.children?.[0],
        registryHas: {
          '-1': ElementTemplateRegistry.has(-1),
          '-2': ElementTemplateRegistry.has(-2),
        },
      };
    }),
    'appends-root-text-via-append-element': runCase(({ root, nativeLog }) => {
      const opcodes = [__OpText, 'root'];

      renderOpcodesIntoElementTemplate(opcodes, root);

      return {
        nativeLog,
        rootChildren: root.children ?? [],
      };
    }),
    'handles-multiple-template-children-in-the-same-slot': runCase(({ root }) => {
      const opcodes = [
        __OpBegin,
        { type: '_et_parent', props: {} },
        __OpSlot,
        0,
        __OpBegin,
        { type: '_et_child_a', props: {} },
        __OpEnd,
        __OpBegin,
        { type: '_et_child_b', props: {} },
        __OpEnd,
        __OpEnd,
      ];

      renderOpcodesIntoElementTemplate(opcodes, root);

      const slotChildren = root.children?.[0]?.children?.[0]?.children ?? [];
      return {
        slotChildrenCount: slotChildren.length,
        slotChildrenTags: slotChildren.map((child: { tag?: string }) => child.tag ?? null),
      };
    }),
    'handles-multiple-text-nodes-in-the-same-slot': runCase(({ root }) => {
      const opcodes = [
        __OpBegin,
        { type: '_et_parent', props: {} },
        __OpSlot,
        0,
        __OpText,
        'A',
        __OpText,
        'B',
        __OpEnd,
      ];

      renderOpcodesIntoElementTemplate(opcodes, root);

      return {
        slotChildren: root.children?.[0]?.children?.[0]?.children ?? [],
      };
    }),
    'ignores-non-attrs-opcode-payloads': runCase(({ root }) => {
      const opcodes = [
        __OpBegin,
        { type: '_et_foo', props: {} },
        __OpAttr,
        'ignored',
        { 0: { id: 'test' } },
        __OpEnd,
      ];

      renderOpcodesIntoElementTemplate(opcodes, root);

      return {
        rootChild: root.children?.[0],
      };
    }),
  };
}
