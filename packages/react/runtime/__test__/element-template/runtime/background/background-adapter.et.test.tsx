import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setupBackgroundElementTemplateDocument } from '../../../../src/element-template/background/document.js';
import type { BackgroundElementTemplateDocument } from '../../../../src/element-template/background/document.js';
import { BackgroundElementTemplateInstance } from '../../../../src/element-template/background/instance.js';
import { Slot } from '../../../../src/element-template/runtime/components/slot.js';

describe('Background Element Template Adapter', () => {
  let doc: BackgroundElementTemplateDocument;

  beforeEach(() => {
    vi.resetAllMocks();
    doc = setupBackgroundElementTemplateDocument();
  });

  it('creates BackgroundElementTemplateInstance for normal elements', () => {
    const el = doc.createElement('view');
    expect(el).toBeInstanceOf(BackgroundElementTemplateInstance);
    expect(el.type).toBe('view');
    expect(el).not.toHaveProperty('text');
  });

  it('creates BackgroundElementTemplateSlot for "slot" type', () => {
    const el = doc.createElement('slot');
    expect(el).toBeInstanceOf(BackgroundElementTemplateInstance);
    expect(el.type).toBe('slot');
  });

  it('creates BackgroundElementTemplateText (via instance) for text nodes', () => {
    const node = doc.createTextNode('hello');
    expect(node).toBeInstanceOf(BackgroundElementTemplateInstance);
    expect(node.type).toBe('raw-text');
    expect((node as BackgroundElementTemplateInstance & { text: string }).text).toBe('hello');
  });

  describe('BackgroundElementTemplateInstance', () => {
    it('supports setAttribute (attrs)', () => {
      const el = new BackgroundElementTemplateInstance('view');
      el.setAttribute('attrs', { 0: { id: 'test' } });
      expect(el._attrs[0]).toEqual({ id: 'test' });
    });

    it('supports hierarchy operations', () => {
      const parent = new BackgroundElementTemplateInstance('parent');
      const child1 = new BackgroundElementTemplateInstance('child1');
      const child2 = new BackgroundElementTemplateInstance('child2');

      // Append
      parent.appendChild(child1);
      expect(child1.parent).toBe(parent);
      expect(parent.firstChild).toBe(child1);
      expect(parent.lastChild).toBe(child1);

      // InsertBefore
      parent.insertBefore(child2, child1); // [child2, child1]
      expect(parent.firstChild).toBe(child2);
      expect(parent.lastChild).toBe(child1);
      expect(child2.nextSibling).toBe(child1);
      expect(child1.previousSibling).toBe(child2);

      // Remove
      parent.removeChild(child2);
      expect(parent.firstChild).toBe(child1);
      expect(child2.parent).toBeNull();
    });
  });

  describe('Slot Component', () => {
    it('returns <slot> element in background', () => {
      vi.stubGlobal('__BACKGROUND__', true);
      const vnode = Slot({ id: 10, children: 'content' }) as unknown as {
        type: string;
        props: { id: number; children: unknown };
      };
      expect(vnode).not.toBe('content');
      expect(vnode.type).toBe('slot');
      expect(vnode.props.id).toBe(10);
      expect(vnode.props.children).toBe('content');

      vi.unstubAllGlobals();
    });

    it('returns children transparently in main thread (default)', () => {
      vi.stubGlobal('__BACKGROUND__', false);
      const res = Slot({ id: 10, children: 'content' });
      expect(res).toBe('content');
      vi.unstubAllGlobals();
    });
  });
});
