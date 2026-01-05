// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { backgroundElementTemplateInstanceManager } from './manager.js';

export class BackgroundElementTemplateInstance {
  public instanceId: number = 0; // Assigned by manager
  public type: string;

  public parent: BackgroundElementTemplateInstance | null = null;
  public firstChild: BackgroundElementTemplateInstance | null = null;
  public lastChild: BackgroundElementTemplateInstance | null = null;
  public nextSibling: BackgroundElementTemplateInstance | null = null;
  public previousSibling: BackgroundElementTemplateInstance | null = null;

  // Shadow State for Hydration
  // 1. Attrs State: mapped by partId
  private _attrs = new Map<number, Record<string, unknown>>();

  get attrs(): Map<number, Record<string, unknown>> {
    return this._attrs;
  }

  set attrs(value: Map<number, Record<string, unknown>> | Record<string, any>) {
    if (value instanceof Map) {
      this._attrs = value;
    } else {
      this.updateAttrsState(value);
    }
  }

  // 2. Slot State: aggregate children by slotId
  get slotChildren(): Map<number, BackgroundElementTemplateInstance[]> {
    const map = new Map<number, BackgroundElementTemplateInstance[]>();
    let child = this.firstChild;
    while (child) {
      // In strict Element Template model, direct children MUST be Slots.
      // We cast directly for performance as per design.
      const slot = child as BackgroundElementTemplateSlot;
      const slotId = slot.partId;

      if (slotId !== undefined && slotId !== -1) {
        const children: BackgroundElementTemplateInstance[] = [];
        let slotChild = slot.firstChild;
        while (slotChild) {
          children.push(slotChild);
          slotChild = slotChild.nextSibling;
        }
        map.set(slotId, children);
      }
      child = child.nextSibling;
    }
    return map;
  }

  public nodeType: number = 1;

  constructor(type: string) {
    this.type = type;
    backgroundElementTemplateInstanceManager.register(this);
  }

  // DOM API for Preact
  appendChild(child: BackgroundElementTemplateInstance): void {
    this.insertBefore(child, null);
  }

  insertBefore(child: BackgroundElementTemplateInstance, beforeChild: BackgroundElementTemplateInstance | null): void {
    if (child.parent) {
      child.parent.removeChild(child);
    }

    child.parent = this;

    if (beforeChild) {
      child.nextSibling = beforeChild;
      child.previousSibling = beforeChild.previousSibling;

      if (beforeChild.previousSibling) {
        beforeChild.previousSibling.nextSibling = child;
      } else {
        this.firstChild = child;
      }
      beforeChild.previousSibling = child;
    } else {
      if (this.lastChild) {
        this.lastChild.nextSibling = child;
        child.previousSibling = this.lastChild;
      } else {
        this.firstChild = child;
      }
      this.lastChild = child;
      child.nextSibling = null;
    }
  }

  removeChild(child: BackgroundElementTemplateInstance): void {
    if (child.parent !== this) {
      throw new Error('Node is not a child of this parent');
    }

    if (child.previousSibling) {
      child.previousSibling.nextSibling = child.nextSibling;
    } else {
      this.firstChild = child.nextSibling;
    }

    if (child.nextSibling) {
      child.nextSibling.previousSibling = child.previousSibling;
    } else {
      this.lastChild = child.previousSibling;
    }

    child.parent = null;
    child.nextSibling = null;
    child.previousSibling = null;
  }

  tearDown(): void {
    // Recursively tear down children first
    let child = this.firstChild;
    while (child) {
      const next = child.nextSibling;
      child.tearDown();
      child = next;
    }

    // Clear references
    this.parent = null;
    this.firstChild = null;
    this.lastChild = null;
    this.previousSibling = null;
    this.nextSibling = null;

    this.attrs.clear();

    // Remove from manager
    if (this.instanceId) {
      backgroundElementTemplateInstanceManager.values.delete(this.instanceId);
    }
  }

  setAttribute(key: string, value: unknown): void {
    if (key === 'attrs') {
      this.updateAttrsState(value as Record<string, any>);
    } else if (key === 'id' && this instanceof BackgroundElementTemplateSlot) {
      this.partId = Number(value);
    }
  }

  private updateAttrsState(rawAttrs: Record<string, any>) {
    this._attrs.clear();
    for (const [partId, props] of Object.entries(rawAttrs)) {
      this._attrs.set(Number(partId), props as Record<string, unknown>);
    }
  }
}

export class BackgroundElementTemplateSlot extends BackgroundElementTemplateInstance {
  public partId: number = -1;

  constructor() {
    super('slot');
  }
}

export class BackgroundElementTemplateText extends BackgroundElementTemplateInstance {
  public text: string = '';

  constructor(text: string) {
    super('raw-text');
    this.text = text;
  }

  override setAttribute(key: string, value: unknown): void {
    if (key === '0' || key === 'data') {
      this.text = String(value);
    } else {
      super.setAttribute(key, value);
    }
  }

  get data(): string {
    return this.text;
  }
  set data(value: string) {
    this.text = value;
  }
}
