import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { jsx } from '../../lepus/jsx-runtime';
import { renderMainThread } from '../../src/lifecycle/render';
import { __root } from '../../src/root';
import { SnapshotInstance, snapshotCreatorMap } from '../../src/snapshot';

describe('Element Template Switch', () => {
  let originalUseElementTemplate;

  beforeEach(() => {
    originalUseElementTemplate = globalThis.__USE_ELEMENT_TEMPLATE__;
    __root.__jsx = null;
    __root.__opcodes = undefined;

    // Register a dummy snapshot creator for 'view' to avoid "Snapshot not found" error
    snapshotCreatorMap['view'] = () => {};

    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.__USE_ELEMENT_TEMPLATE__ = originalUseElementTemplate;
    delete snapshotCreatorMap['view'];
  });

  it('should create SnapshotInstance when switch is OFF', () => {
    globalThis.__USE_ELEMENT_TEMPLATE__ = false;
    const vnode = jsx('view', { id: 'test' });
    expect(vnode).toBeInstanceOf(SnapshotInstance);
    expect(vnode.type).toBe('view');
  });

  it('should create plain VNode when switch is ON', () => {
    globalThis.__USE_ELEMENT_TEMPLATE__ = true;
    const vnode = jsx('view', { id: 'test' });
    expect(vnode).not.toBeInstanceOf(SnapshotInstance);
    expect(vnode.type).toBe('view');
    expect(vnode.props).toEqual({ id: 'test' });
    expect(vnode.constructor).toBeUndefined();
  });

  it('should skip renderOpcodesInto when switch is ON', () => {
    globalThis.__USE_ELEMENT_TEMPLATE__ = true;

    // Mock __root.__jsx with a plain VNode tree
    const vnode = jsx('view', { id: 'root' });
    __root.__jsx = vnode;

    const insertSpy = vi.spyOn(__root, 'insertBefore');

    renderMainThread();

    expect(insertSpy).not.toHaveBeenCalled();
    expect(__root.__opcodes).toBeDefined();
    // Verify opcodes are generated (Opcode.Begin = 0)
    expect(__root.__opcodes.length).toBeGreaterThan(0);
    expect(__root.__opcodes[0]).toBe(0);
  });

  it('should call renderOpcodesInto when switch is OFF', () => {
    globalThis.__USE_ELEMENT_TEMPLATE__ = false;

    const vnode = jsx('view', { id: 'root' });
    __root.__jsx = vnode;

    const insertSpy = vi.spyOn(__root, 'insertBefore');

    renderMainThread();

    expect(insertSpy).toHaveBeenCalled();
  });
});
