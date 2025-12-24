// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ElementTemplateRegistry } from '../../src/element-template/elementTemplateRegistry.js';
import { renderOpcodesIntoElementTemplate } from '../../src/element-template/renderOpcodesIntoElementTemplate.js';
import { resetTemplateId } from '../../src/element-template/elementTemplateHandle.js';
import { __OpAttr, __OpBegin, __OpEnd, __OpSlotBegin, __OpSlotEnd, __OpText } from '../../src/renderToOpcodes/index.js';
import { installMockNativePapi } from './utils/mockNativePapi.js';

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

    root = { children: [] };
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

    expect(nativeLog).toEqual([
      ['__CreateRawText', 'Hello'],
      [
        '__ElementFromBinary',
        '_et_foo',
        null,
        [
          4,
          0,
          {
            id: 'test',
          },
          2,
          1,
          null,
          {
            type: 'rawText',
            text: 'Hello',
          },
        ],
        null,
      ],
    ]);
    expect(ElementTemplateRegistry.get(-1)?.nativeRef).toEqual({
      type: 'element',
      tag: '_et_foo',
      parts: {
        0: { id: 'test' },
      },
      slots: {
        1: [{ type: 'rawText', text: 'Hello' }],
      },
    });

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

    expect(nativeLog).toEqual([
      ['__CreateRawText', 'A'],
      ['__CreateRawText', 'B'],
      [
        '__ElementFromBinary',
        '_et_foo',
        null,
        [
          2,
          0,
          null,
          { type: 'rawText', text: 'A' },
          2,
          1,
          null,
          { type: 'rawText', text: 'B' },
        ],
        null,
      ],
    ]);
    expect(root.children[0]).toEqual({
      type: 'element',
      tag: '_et_foo',
      parts: {},
      slots: {
        0: [{ type: 'rawText', text: 'A' }],
        1: [{ type: 'rawText', text: 'B' }],
      },
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

    expect(nativeLog).toEqual([
      ['__CreateRawText', 'X'],
      [
        '__ElementFromBinary',
        '_et_inner',
        null,
        [
          4,
          0,
          { id: 'inner' },
          2,
          0,
          null,
          { type: 'rawText', text: 'X' },
        ],
        null,
      ],
      [
        '__ElementFromBinary',
        '_et_outer',
        null,
        [
          2,
          0,
          null,
          {
            type: 'element',
            tag: '_et_inner',
            parts: {
              0: { id: 'inner' },
            },
            slots: {
              0: [{ type: 'rawText', text: 'X' }],
            },
          },
        ],
        null,
      ],
    ]);

    expect(root.children[0]).toEqual({
      type: 'element',
      tag: '_et_outer',
      parts: {},
      slots: {
        0: [
          {
            type: 'element',
            tag: '_et_inner',
            parts: {
              0: { id: 'inner' },
            },
            slots: {
              0: [{ type: 'rawText', text: 'X' }],
            },
          },
        ],
      },
    });
    expect(ElementTemplateRegistry.has(-1)).toBe(true);
    expect(ElementTemplateRegistry.has(-2)).toBe(true);
  });

  it('appends root text when no template frame is active', () => {
    const opcodes = [
      __OpText,
      'root',
    ];

    renderOpcodesIntoElementTemplate(opcodes, root);

    expect(root.children).toEqual([{ type: 'rawText', text: 'root' }]);
  });

  it('appends element via __AppendElement when root has no children array', () => {
    const appendSpy = vi.fn();
    vi.stubGlobal('__AppendElement', appendSpy);

    root = {};

    const opcodes = [
      __OpBegin,
      { type: '_et_foo', props: {} },
      __OpEnd,
    ];

    renderOpcodesIntoElementTemplate(opcodes, root);

    expect(appendSpy).toHaveBeenCalledWith(
      root,
      ElementTemplateRegistry.get(-1)?.nativeRef,
    );
  });

  it('appends root text via __AppendElement when root has no children array', () => {
    const appendSpy = vi.fn();
    vi.stubGlobal('__AppendElement', appendSpy);

    root = {};

    const opcodes = [
      __OpText,
      'root',
    ];

    renderOpcodesIntoElementTemplate(opcodes, root);

    expect(appendSpy).toHaveBeenCalledWith(
      root,
      { type: 'rawText', text: 'root' },
    );
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

    expect(root.children[0].slots[0]).toHaveLength(2);
    expect(root.children[0].slots[0][0].tag).toBe('_et_child_a');
    expect(root.children[0].slots[0][1].tag).toBe('_et_child_b');
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

    expect(root.children[0].slots[0]).toEqual([
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
      type: 'element',
      tag: '_et_foo',
      parts: {},
      slots: {},
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
