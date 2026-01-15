import { vi } from 'vitest';

import { renderOpcodesIntoElementTemplate } from '../../../../../src/element-template/runtime/render/render-opcodes.js';
import { resetTemplateId } from '../../../../../src/element-template/runtime/template/handle.js';
import { ElementTemplateRegistry } from '../../../../../src/element-template/runtime/template/registry.js';
import { __OpAttr, __OpBegin, __OpEnd, __OpSlot, __OpText } from '../../../../../src/renderToOpcodes/index.js';
import { installMockNativePapi } from '../../../test-utils/mockNativePapi.js';
import { registerTemplates } from '../../../test-utils/registry.js';

export interface RootNode {
  type: 'root';
  children?: unknown[];
}

export interface CaseContext {
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

export function runCase<T>(runner: (context: CaseContext) => T): T {
  const context = setup();
  try {
    return runner(context);
  } finally {
    context.cleanup();
  }
}

export { ElementTemplateRegistry, renderOpcodesIntoElementTemplate, __OpAttr, __OpBegin, __OpEnd, __OpSlot, __OpText };
