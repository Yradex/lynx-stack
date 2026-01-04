// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderOpcodesIntoElementTemplate } from '../../../../src/element-template/runtime/render/render-opcodes.js';
import { resetTemplateId } from '../../../../src/element-template/runtime/template/handle.js';
import { ElementTemplateRegistry } from '../../../../src/element-template/runtime/template/registry.js';
import {
  __OpAttr,
  __OpBegin,
  __OpEnd,
  __OpSlotBegin,
  __OpSlotEnd,
  __OpText,
} from '../../../../src/renderToOpcodes/index.js';
import { installMockNativePapi } from '../../test-utils/mockNativePapi.js';
import { registerTemplates } from '../../test-utils/registry.js';

describe('renderOpcodesIntoElementTemplate', () => {
  let root: any;
  let nativeLog: any[];
  let mockReportError: any;
  let cleanup: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    ElementTemplateRegistry.clear();
    resetTemplateId();

    const installed = installMockNativePapi();
    nativeLog = installed.nativeLog;
    cleanup = installed.cleanup;
    mockReportError = installed.mockReportError;

    root = { type: 'root' };
    registerTemplates([
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
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it('builds init opcodes from attrs and slot text', () => {
    const opcodes = [
      __OpBegin,
      { type: '_et_foo', props: {} },
      __OpAttr,
      'attrs',
      { 0: { id: 'test' } },
      __OpSlotBegin,
      1,
      __OpText,
      'Hello',
      __OpSlotEnd,
      __OpEnd,
    ];

    renderOpcodesIntoElementTemplate(opcodes, root);

    expect(nativeLog).toMatchInlineSnapshot(`
      [
        [
          "__CreateRawText",
          "Hello",
        ],
        [
          "__ElementFromBinary",
          "_et_foo",
          null,
          [
            {
              "attributes": {
                "id": "test",
              },
              "id": 0,
              "type": "setAttributes",
            },
            {
              "id": 1,
              "node": {
                "text": "Hello",
                "type": "rawText",
              },
              "type": "insertBefore",
            },
          ],
          null,
        ],
        [
          "__AppendElement",
          "root",
          "<_et_foo />",
        ],
      ]
    `);
    expect(ElementTemplateRegistry.get(-1)?.nativeRef).toMatchInlineSnapshot(`
      {
        "attributes": {
          "part-id": 0,
        },
        "children": [
          {
            "attributes": {
              "id": "test",
              "part-id": 0,
            },
            "tag": "slot",
          },
          {
            "attributes": {
              "part-id": 1,
            },
            "children": [
              {
                "text": "Hello",
                "type": "rawText",
              },
            ],
            "tag": "slot",
          },
        ],
        "tag": "_et_foo",
        "templateId": "_et_foo",
      }
    `);

    expect(root.children[0]).toEqual(ElementTemplateRegistry.get(-1)?.nativeRef);
  });

  it('keeps slot children separated and ordered', () => {
    const opcodes = [
      __OpBegin,
      { type: '_et_foo', props: {} },
      __OpSlotBegin,
      0,
      __OpText,
      'A',
      __OpSlotEnd,
      __OpSlotBegin,
      1,
      __OpText,
      'B',
      __OpSlotEnd,
      __OpEnd,
    ];

    renderOpcodesIntoElementTemplate(opcodes, root);

    expect(nativeLog).toMatchInlineSnapshot(`
      [
        [
          "__CreateRawText",
          "A",
        ],
        [
          "__CreateRawText",
          "B",
        ],
        [
          "__ElementFromBinary",
          "_et_foo",
          null,
          [
            {
              "id": 0,
              "node": {
                "text": "A",
                "type": "rawText",
              },
              "type": "insertBefore",
            },
            {
              "id": 1,
              "node": {
                "text": "B",
                "type": "rawText",
              },
              "type": "insertBefore",
            },
          ],
          null,
        ],
        [
          "__AppendElement",
          "root",
          "<_et_foo />",
        ],
      ]
    `);
    expect(root.children[0]).toEqual({
      tag: '_et_foo',
      templateId: '_et_foo',
      attributes: { 'part-id': 0 },
      children: [
        {
          tag: 'slot',
          attributes: { 'part-id': 0 },
          children: [{ type: 'rawText', text: 'A' }],
        },
        {
          tag: 'slot',
          attributes: { 'part-id': 1 },
          children: [{ type: 'rawText', text: 'B' }],
        },
      ],
    });
  });

  it('inserts nested templates into parent slots', () => {
    const opcodes = [
      __OpBegin,
      { type: '_et_outer', props: {} },
      __OpSlotBegin,
      0,
      __OpBegin,
      { type: '_et_inner', props: {} },
      __OpAttr,
      'attrs',
      { 0: { id: 'inner' } },
      __OpSlotBegin,
      0,
      __OpText,
      'X',
      __OpSlotEnd,
      __OpEnd,
      __OpSlotEnd,
      __OpEnd,
    ];

    renderOpcodesIntoElementTemplate(opcodes, root);

    expect(nativeLog).toMatchInlineSnapshot(`
      [
        [
          "__CreateRawText",
          "X",
        ],
        [
          "__ElementFromBinary",
          "_et_inner",
          null,
          [
            {
              "attributes": {
                "id": "inner",
              },
              "id": 0,
              "type": "setAttributes",
            },
            {
              "id": 0,
              "node": {
                "text": "X",
                "type": "rawText",
              },
              "type": "insertBefore",
            },
          ],
          null,
        ],
        [
          "__ElementFromBinary",
          "_et_outer",
          null,
          [
            {
              "id": 0,
              "node": {
                "attributes": {
                  "id": "inner",
                  "part-id": 0,
                },
                "children": [
                  {
                    "attributes": {
                      "part-id": 1,
                    },
                    "tag": "slot",
                  },
                ],
                "tag": "_et_inner",
                "templateId": "_et_inner",
              },
              "type": "insertBefore",
            },
          ],
          null,
        ],
        [
          "__AppendElement",
          "root",
          "<_et_outer />",
        ],
      ]
    `);

    expect(root.children[0]).toMatchInlineSnapshot(`
      {
        "attributes": {},
        "children": [
          {
            "attributes": {
              "part-id": 0,
            },
            "children": [
              {
                "attributes": {
                  "id": "inner",
                  "part-id": 0,
                },
                "children": [
                  {
                    "attributes": {
                      "part-id": 1,
                    },
                    "tag": "slot",
                  },
                ],
                "tag": "_et_inner",
                "templateId": "_et_inner",
              },
            ],
            "tag": "slot",
          },
        ],
        "tag": "_et_outer",
        "templateId": "_et_outer",
      }
    `);
    expect(ElementTemplateRegistry.has(-1)).toBe(true);
    expect(ElementTemplateRegistry.has(-2)).toBe(true);
  });

  it('appends root text via __AppendElement', () => {
    const opcodes = [
      __OpText,
      'root',
    ];

    renderOpcodesIntoElementTemplate(opcodes, root);

    expect(nativeLog).toContainEqual([
      '__AppendElement',
      'root',
      '"root"',
    ]);
  });

  it('logs when element is encountered outside of a slot', () => {
    const opcodes = [
      __OpBegin,
      { type: '_et_parent', props: {} },
      __OpBegin,
      { type: '_et_child', props: {} },
      __OpEnd,
      __OpEnd,
    ];

    renderOpcodesIntoElementTemplate(opcodes, root);

    expect(mockReportError).toHaveBeenCalled();
    mockReportError.mockClear();
    (globalThis as any).__LYNX_REPORT_ERROR_CALLS = [];
  });

  it('logs when text is encountered outside of a slot', () => {
    const opcodes = [
      __OpBegin,
      { type: '_et_parent', props: {} },
      __OpText,
      'Oops',
      __OpEnd,
    ];

    renderOpcodesIntoElementTemplate(opcodes, root);

    expect(mockReportError).toHaveBeenCalled();
    mockReportError.mockClear();
    (globalThis as any).__LYNX_REPORT_ERROR_CALLS = [];
  });

  it('handles multiple template children in the same slot', () => {
    const opcodes = [
      __OpBegin,
      { type: '_et_parent', props: {} },
      __OpSlotBegin,
      0,
      __OpBegin,
      { type: '_et_child_a', props: {} },
      __OpEnd,
      __OpBegin,
      { type: '_et_child_b', props: {} },
      __OpEnd,
      __OpSlotEnd,
      __OpEnd,
    ];

    renderOpcodesIntoElementTemplate(opcodes, root);

    expect(root.children[0].children[0].children).toHaveLength(2);
    expect(root.children[0].children[0].children[0].tag).toBe('_et_child_a');
    expect(root.children[0].children[0].children[1].tag).toBe('_et_child_b');
  });

  it('handles multiple text nodes in the same slot', () => {
    const opcodes = [
      __OpBegin,
      { type: '_et_parent', props: {} },
      __OpSlotBegin,
      0,
      __OpText,
      'A',
      __OpText,
      'B',
      __OpSlotEnd,
      __OpEnd,
    ];

    renderOpcodesIntoElementTemplate(opcodes, root);

    expect(root.children[0].children[0].children).toEqual([
      { type: 'rawText', text: 'A' },
      { type: 'rawText', text: 'B' },
    ]);
  });

  it('ignores non-attrs opcode payloads', () => {
    const opcodes = [
      __OpBegin,
      { type: '_et_foo', props: {} },
      __OpAttr,
      'ignored',
      { 0: { id: 'test' } },
      __OpEnd,
    ];

    renderOpcodesIntoElementTemplate(opcodes, root);

    expect(root.children[0]).toEqual({
      tag: '_et_foo',
      templateId: '_et_foo',
      attributes: { 'part-id': 0 },
      children: [
        { tag: 'slot', attributes: { 'part-id': 0 } },
        { tag: 'slot', attributes: { 'part-id': 1 } },
      ],
    });
  });

  it('throws when popping the root frame', () => {
    expect(() => renderOpcodesIntoElementTemplate([__OpEnd], root)).toThrow(
      'Popped root frame',
    );
  });

  it('throws when the stack underflows', () => {
    const originalPop = Array.prototype.pop;
    let hasReturnedUndefined = false;
    const popSpy = vi.spyOn(Array.prototype, 'pop').mockImplementation(function() {
      if (!hasReturnedUndefined) {
        hasReturnedUndefined = true;
        return undefined;
      }
      return originalPop.apply(this);
    });

    expect(() => renderOpcodesIntoElementTemplate([__OpEnd], root)).toThrow(
      'Stack underflow',
    );

    popSpy.mockRestore();
  });

  it('throws on unknown opcodes', () => {
    expect(() => renderOpcodesIntoElementTemplate([999], root)).toThrow(
      'Unknown opcode: 999',
    );
  });
});
