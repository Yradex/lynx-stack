import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupBackgroundElementTemplateDocument } from '../../../../src/element-template/background/document.js';
import { options } from 'preact';
import { BackgroundElementTemplateInstance } from '../../../../src/element-template/background/instance.js';
import { Slot } from '../../../../src/element-template/runtime/components/slot.js';

describe('Background Element Template Adapter', () => {
  // @ts-expect-error
  let doc: any;

  beforeEach(() => {
    vi.resetAllMocks();
    setupBackgroundElementTemplateDocument();
    doc = options.document;
  });

  it('creates BackgroundElementTemplateInstance for normal elements', () => {
    const el = doc.createElement('view');
    expect(el).toBeInstanceOf(BackgroundElementTemplateInstance);
    expect((el as any).type).toBe('view');
    expect(el).not.toHaveProperty('text');
  });

  it('creates BackgroundElementTemplateSlot for "slot" type', () => {
    const el = doc.createElement('slot');
    expect(el).toBeInstanceOf(BackgroundElementTemplateInstance);
    expect((el as any).type).toBe('slot');
  });

  it('creates BackgroundElementTemplateText (via instance) for text nodes', () => {
    const node = doc.createTextNode('hello');
    expect(node).toBeInstanceOf(BackgroundElementTemplateInstance);
    expect((node as any).type).toBe('raw-text');
    expect((node as any).text).toBe('hello');
  });

  describe('BackgroundElementTemplateInstance', () => {
    it('supports setAttribute', () => {
      const el = new BackgroundElementTemplateInstance('view');
      el.setAttribute('id', 'test');
      expect(el.attributes['id']).toBe('test');
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
      const res = Slot({ id: 10, children: 'content' });
      // In a real environment this would be a VNode, but let's check basic structure if possible,
      // or at least that it doesn't return just children.
      // Since we are mocking __BACKGROUND__, Slot should return JSX.
      // In this test env, JSX might be transpiled or just return an object.
      // We check if it is an object with type 'slot' or similar.
      expect(res).not.toBe('content');
      expect(res.type).toBe('slot');
      expect(res.props.id).toBe(10);
      expect(res.props.children).toBe('content');

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
