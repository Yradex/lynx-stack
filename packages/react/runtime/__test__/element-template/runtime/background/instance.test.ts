// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  BackgroundElementTemplateInstance,
  BackgroundElementTemplateSlot,
  BackgroundElementTemplateText,
} from '../../../../src/element-template/background/instance.js';
import { backgroundElementTemplateInstanceManager } from '../../../../src/element-template/background/manager.js';

describe('BackgroundElementTemplateInstance', () => {
  beforeEach(() => {
    backgroundElementTemplateInstanceManager.clear();
    backgroundElementTemplateInstanceManager.nextId = 0;
  });

  it('should create an instance with correct type and id', () => {
    const instance = new BackgroundElementTemplateInstance('view');
    expect(instance.type).toBe('view');
    expect(instance.instanceId).toBe(1);
  });

  it('should increment id for new instances', () => {
    const instance1 = new BackgroundElementTemplateInstance('view');
    const instance2 = new BackgroundElementTemplateInstance('text');
    expect(instance1.instanceId).toBe(1);
    expect(instance2.instanceId).toBe(2);
  });

  describe('appendChild', () => {
    it('should append child correctly', () => {
      const parent = new BackgroundElementTemplateInstance('view');
      const child = new BackgroundElementTemplateInstance('text');
      parent.appendChild(child);

      expect(parent.firstChild).toBe(child);
      expect(parent.lastChild).toBe(child);
      expect(child.parent).toBe(parent);
    });

    it('should append multiple children correctly', () => {
      const parent = new BackgroundElementTemplateInstance('view');
      const child1 = new BackgroundElementTemplateInstance('text');
      const child2 = new BackgroundElementTemplateInstance('image');

      parent.appendChild(child1);
      parent.appendChild(child2);

      expect(parent.firstChild).toBe(child1);
      expect(parent.lastChild).toBe(child2);
      expect(child1.nextSibling).toBe(child2);
      expect(child2.previousSibling).toBe(child1);
    });

    it('should reparent child from old parent', () => {
      const parent1 = new BackgroundElementTemplateInstance('view');
      const parent2 = new BackgroundElementTemplateInstance('view');
      const child = new BackgroundElementTemplateInstance('text');

      parent1.appendChild(child);
      parent2.appendChild(child);

      expect(parent1.firstChild).toBeNull();
      expect(parent1.lastChild).toBeNull();
      expect(parent2.firstChild).toBe(child);
      expect(parent2.lastChild).toBe(child);
      expect(child.parent).toBe(parent2);
    });
  });

  describe('insertBefore', () => {
    it('should insert before existing child', () => {
      const parent = new BackgroundElementTemplateInstance('view');
      const child1 = new BackgroundElementTemplateInstance('text');
      const child2 = new BackgroundElementTemplateInstance('image');

      parent.appendChild(child1);
      parent.insertBefore(child2, child1);

      expect(parent.firstChild).toBe(child2);
      expect(parent.lastChild).toBe(child1);
      expect(child2.nextSibling).toBe(child1);
      expect(child1.previousSibling).toBe(child2);
    });

    it('should append if beforeChild is null', () => {
      const parent = new BackgroundElementTemplateInstance('view');
      const child = new BackgroundElementTemplateInstance('text');
      parent.insertBefore(child, null);

      expect(parent.firstChild).toBe(child);
      expect(parent.lastChild).toBe(child);
    });

    it('should move existing child if re-inserted', () => {
      const parent = new BackgroundElementTemplateInstance('view');
      const child1 = new BackgroundElementTemplateInstance('text');
      const child2 = new BackgroundElementTemplateInstance('image');

      parent.appendChild(child1);
      parent.appendChild(child2);
      // Move child2 before child1
      parent.insertBefore(child2, child1);

      expect(parent.firstChild).toBe(child2);
      expect(parent.lastChild).toBe(child1);
      expect(child2.nextSibling).toBe(child1);
    });

    it('should insert between two nodes', () => {
      const parent = new BackgroundElementTemplateInstance('view');
      const child1 = new BackgroundElementTemplateInstance('text');
      const child2 = new BackgroundElementTemplateInstance('image');
      const child3 = new BackgroundElementTemplateInstance('view');

      parent.appendChild(child1);
      parent.appendChild(child2);

      // Insert child3 before child2. child2 has previousSibling child1.
      parent.insertBefore(child3, child2);

      expect(parent.firstChild).toBe(child1);
      expect(parent.lastChild).toBe(child2);
      expect(child1.nextSibling).toBe(child3);
      expect(child3.nextSibling).toBe(child2);
      expect(child3.previousSibling).toBe(child1);
      expect(child2.previousSibling).toBe(child3);
    });

    it('should reparent child before target in new parent', () => {
      const parent1 = new BackgroundElementTemplateInstance('view');
      const parent2 = new BackgroundElementTemplateInstance('view');
      const child1 = new BackgroundElementTemplateInstance('text');
      const child2 = new BackgroundElementTemplateInstance('image');
      const mover = new BackgroundElementTemplateInstance('view');

      parent1.appendChild(mover);
      parent2.appendChild(child1);
      parent2.appendChild(child2);

      parent2.insertBefore(mover, child2);

      expect(parent1.firstChild).toBeNull();
      expect(parent1.lastChild).toBeNull();
      expect(parent2.firstChild).toBe(child1);
      expect(child1.nextSibling).toBe(mover);
      expect(mover.nextSibling).toBe(child2);
      expect(child2.previousSibling).toBe(mover);
      expect(mover.parent).toBe(parent2);
    });
  });

  describe('removeChild', () => {
    it('should remove child correctly', () => {
      const parent = new BackgroundElementTemplateInstance('view');
      const child = new BackgroundElementTemplateInstance('text');
      parent.appendChild(child);
      parent.removeChild(child);

      expect(parent.firstChild).toBeNull();
      expect(parent.lastChild).toBeNull();
      expect(child.parent).toBeNull();
    });

    it('should update siblings when removing middle child', () => {
      const parent = new BackgroundElementTemplateInstance('view');
      const child1 = new BackgroundElementTemplateInstance('text');
      const child2 = new BackgroundElementTemplateInstance('image');
      const child3 = new BackgroundElementTemplateInstance('view');

      parent.appendChild(child1);
      parent.appendChild(child2);
      parent.appendChild(child3);

      parent.removeChild(child2);

      expect(child1.nextSibling).toBe(child3);
      expect(child3.previousSibling).toBe(child1);
      expect(parent.firstChild).toBe(child1);
      expect(parent.lastChild).toBe(child3);
    });

    it('should update head when removing first child', () => {
      const parent = new BackgroundElementTemplateInstance('view');
      const child1 = new BackgroundElementTemplateInstance('text');
      const child2 = new BackgroundElementTemplateInstance('image');

      parent.appendChild(child1);
      parent.appendChild(child2);

      parent.removeChild(child1);

      expect(parent.firstChild).toBe(child2);
      expect(parent.lastChild).toBe(child2);
      expect(child2.previousSibling).toBeNull();
    });

    it('should update tail when removing last child', () => {
      const parent = new BackgroundElementTemplateInstance('view');
      const child1 = new BackgroundElementTemplateInstance('text');
      const child2 = new BackgroundElementTemplateInstance('image');

      parent.appendChild(child1);
      parent.appendChild(child2);

      parent.removeChild(child2);

      expect(parent.firstChild).toBe(child1);
      expect(parent.lastChild).toBe(child1);
      expect(child1.nextSibling).toBeNull();
    });

    it('should throw error if removing non-child', () => {
      const parent = new BackgroundElementTemplateInstance('view');
      const other = new BackgroundElementTemplateInstance('text');
      expect(() => parent.removeChild(other)).toThrow('Node is not a child of this parent');
    });
  });

  it('should be registered with manager upon creation', () => {
    const instance = new BackgroundElementTemplateInstance('view');
    expect(backgroundElementTemplateInstanceManager.get(instance.instanceId)).toBe(instance);
  });

  it('should tear down correctly', () => {
    const parent = new BackgroundElementTemplateInstance('view');
    const child = new BackgroundElementTemplateInstance('text');
    parent.appendChild(child);

    const parentId = parent.instanceId;
    const childId = child.instanceId;

    expect(backgroundElementTemplateInstanceManager.get(parentId)).toBe(parent);
    expect(backgroundElementTemplateInstanceManager.get(childId)).toBe(child);

    parent.tearDown();

    // Check manager clean up
    expect(backgroundElementTemplateInstanceManager.get(parentId)).toBeUndefined();
    expect(backgroundElementTemplateInstanceManager.get(childId)).toBeUndefined();

    // Check reference clean up
    expect(parent.firstChild).toBeNull();
    expect(child.parent).toBeNull();
  });
});

describe('BackgroundElementTemplateSlot', () => {
  it('should have correct type', () => {
    const slot = new BackgroundElementTemplateSlot();
    expect(slot.type).toBe('slot');
  });
});

describe('BackgroundElementTemplateText', () => {
  it('should have correct type and text', () => {
    const textNode = new BackgroundElementTemplateText('hello');
    expect(textNode.type).toBe('raw-text');
    expect(textNode.text).toBe('hello');
  });

  it('should update text via setAttribute', () => {
    const textNode = new BackgroundElementTemplateText('');
    textNode.setAttribute('0', 'world');
    expect(textNode.text).toBe('world');

    textNode.setAttribute('data', 'demo');
    expect(textNode.text).toBe('demo');
  });

  it('should update text via data property', () => {
    const textNode = new BackgroundElementTemplateText('');
    textNode.data = 'world';
    expect(textNode.text).toBe('world');
    expect(textNode.data).toBe('world');
  });

  it('should delegate unknown attributes to super (e.g. attrs)', () => {
    const textNode = new BackgroundElementTemplateText('');
    const attrs = { 0: { color: 'red' } };
    textNode.setAttribute('attrs', attrs);
    expect(textNode.attrs.get(0)).toEqual({ color: 'red' });
  });
});

describe('BackgroundElementTemplateInstance Shadow State', () => {
  it('should update attrs map when setAttribute("attrs", ...) is called', () => {
    const instance = new BackgroundElementTemplateInstance('view');
    const attrs = {
      0: { id: 'a' },
      1: { class: 'foo' },
    };
    instance.setAttribute('attrs', attrs);

    expect(instance.attrs.size).toBe(2);
    expect(instance.attrs.get(0)).toEqual({ id: 'a' });
    expect(instance.attrs.get(1)).toEqual({ class: 'foo' });
  });

  it('should update partId for slot when setAttribute is called', () => {
    const slot = new BackgroundElementTemplateSlot();
    slot.setAttribute('id', 10);
    expect(slot.partId).toBe(10);
  });

  it('should aggregate slotChildren correctly', () => {
    const root = new BackgroundElementTemplateInstance('element-template-view');

    const slot1 = new BackgroundElementTemplateSlot();
    slot1.setAttribute('id', 0);
    const text1 = new BackgroundElementTemplateText('Hello');
    slot1.appendChild(text1);

    const slot2 = new BackgroundElementTemplateSlot();
    slot2.setAttribute('id', 1);
    const text2 = new BackgroundElementTemplateText('World');
    const view2 = new BackgroundElementTemplateInstance('view');
    slot2.appendChild(text2);
    slot2.appendChild(view2);

    root.appendChild(slot1);
    root.appendChild(slot2);

    const slotChildren = root.slotChildren;
    expect(slotChildren.size).toBe(2);

    expect(slotChildren.get(0)).toEqual(['Hello']);
    expect(slotChildren.get(1)).toEqual(['World', view2]);
  });

  it('should ignore non-slot direct children (though technically invalid)', () => {
    const root = new BackgroundElementTemplateInstance('element-template-view');
    const view = new BackgroundElementTemplateInstance('view');
    root.appendChild(view);

    // Should assume it is a slot but fail to get partId or valid id
    const slotChildren = root.slotChildren;
    expect(slotChildren.size).toBe(0);
  });
});
