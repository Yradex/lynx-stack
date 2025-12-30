// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

export class BackgroundElementTemplateInstance {
  static nextId = 1;

  public __instanceId: number;
  public type: string;

  public parent: BackgroundElementTemplateInstance | null = null;
  public firstChild: BackgroundElementTemplateInstance | null = null;
  public lastChild: BackgroundElementTemplateInstance | null = null;
  public nextSibling: BackgroundElementTemplateInstance | null = null;
  public previousSibling: BackgroundElementTemplateInstance | null = null;

  // For storing attributes set by Preact
  public attributes: Record<string, unknown> = {};

  public nodeType: number = 1;

  constructor(type: string) {
    this.type = type;
    this.__instanceId = BackgroundElementTemplateInstance.nextId++;
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

  setAttribute(key: string, value: unknown): void {
    this.attributes[key] = value;
    // For convenience in tests and Preact compatibility
    (this as unknown as Record<string, unknown>)[key] = value;
  }
}

export class BackgroundElementTemplateSlot extends BackgroundElementTemplateInstance {
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
