// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { GlobalCommitContext } from './commit-context.js';
import { backgroundElementTemplateInstanceManager } from './manager.js';
import { isDirectOrDeepEqual } from '../../utils.js';
import { ElementTemplateOpcodes } from '../protocol/opcodes.js';

function pushUpdate(targetId: number, opcodes: unknown[]): void {
  const stream = GlobalCommitContext.patches;
  const lastHeader = stream[stream.length - 2];
  const lastOpcodes = stream[stream.length - 1];
  if (lastHeader === targetId && Array.isArray(lastOpcodes)) {
    lastOpcodes.push(...opcodes);
    return;
  }
  stream.push(targetId, opcodes);
}

const RAW_TEXT_TEMPLATE_KEY = 'raw-text';

type AttrsByPartId = Record<number, Record<string, unknown>>;

export class BackgroundElementTemplateInstance {
  public instanceId: number = 0; // Assigned by manager
  public type: string;
  public nodeCount: number | null = null;

  public parent: BackgroundElementTemplateInstance | null = null;
  public firstChild: BackgroundElementTemplateInstance | null = null;
  public lastChild: BackgroundElementTemplateInstance | null = null;
  public nextSibling: BackgroundElementTemplateInstance | null = null;
  public previousSibling: BackgroundElementTemplateInstance | null = null;

  // Shadow State for Hydration
  // 1. Attrs State: mapped by partId
  private _attrs: AttrsByPartId = {};

  get attrs(): AttrsByPartId {
    return this._attrs;
  }

  set attrs(value: AttrsByPartId) {
    this._attrs = value;
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

  emitCreate(): void {
    if (this.instanceId === 0 && __DEV__) {
      lynx.reportError(new Error('ElementTemplate patch has illegal handleId 0.'));
      return;
    }

    if (this.type === RAW_TEXT_TEMPLATE_KEY) {
      const text = this instanceof BackgroundElementTemplateText ? this.text : '';
      GlobalCommitContext.patches.push(0, this.instanceId, RAW_TEXT_TEMPLATE_KEY, text);
      return;
    }

    const initOpcodes: unknown[] = [];
    const attrsByPartId = this._attrs;
    for (const partIdStr in attrsByPartId) {
      const attrs = attrsByPartId[partIdStr as unknown as number];
      initOpcodes.push(ElementTemplateOpcodes.setAttributes, Number(partIdStr), attrs);
    }
    GlobalCommitContext.patches.push(0, this.instanceId, this.type, initOpcodes, this.nodeCount);
  }

  // DOM API for Preact
  appendChild(child: BackgroundElementTemplateInstance): void {
    this.insertBefore(child, null);
  }

  insertBefore(
    child: BackgroundElementTemplateInstance,
    beforeChild: BackgroundElementTemplateInstance | null,
    silent?: boolean,
  ): void {
    if (child.parent) {
      child.parent.removeChild(child, true);
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

    if (silent) {
      return;
    }

    if (this instanceof BackgroundElementTemplateSlot) {
      const slotId = this.partId;
      const parent = this.parent;
      if (slotId !== -1 && parent) {
        const beforeId = beforeChild ? beforeChild.instanceId : null;
        pushUpdate(parent.instanceId, [
          ElementTemplateOpcodes.insertBefore,
          slotId,
          beforeId,
          child.instanceId,
        ]);
      }
    }
  }

  removeChild(child: BackgroundElementTemplateInstance, silent?: boolean): void {
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

    if (silent) {
      return;
    }

    if (this instanceof BackgroundElementTemplateSlot) {
      const slotId = this.partId;
      const parent = this.parent;
      if (slotId !== -1 && parent) {
        pushUpdate(parent.instanceId, [
          ElementTemplateOpcodes.removeChild,
          slotId,
          child.instanceId,
        ]);
      }
    }
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

    this._attrs = {};

    // Remove from manager
    if (this.instanceId) {
      backgroundElementTemplateInstanceManager.values.delete(this.instanceId);
    }
  }

  setAttribute(key: string, value: unknown): void {
    if (key === 'attrs') {
      const rawAttrs = (value ?? {}) as Record<string, unknown>;
      const prev = this._attrs;
      const next: AttrsByPartId = {};

      for (const partIdStr in rawAttrs) {
        const partId = Number(partIdStr);
        const nextPropsRaw = rawAttrs[partIdStr];
        const nextProps = (nextPropsRaw ?? {}) as Record<string, unknown>;

        next[partId] = nextProps;

        const prevProps = prev[partId];
        if (prevProps === nextProps) {
          continue;
        }

        let patch: Record<string, unknown> | undefined;

        for (const k in nextProps) {
          const nextValue = nextProps[k];
          const prevValue = prevProps?.[k];
          if (!isDirectOrDeepEqual(nextValue, prevValue)) {
            patch ??= {};
            patch[k] = nextValue;
          }
        }

        if (prevProps) {
          for (const k in prevProps) {
            if (!(k in nextProps)) {
              patch ??= {};
              patch[k] = undefined;
            }
          }
        }

        if (patch) {
          pushUpdate(this.instanceId, [
            ElementTemplateOpcodes.setAttributes,
            partId,
            patch,
          ]);
        }
      }

      for (const partIdStr in prev) {
        if (partIdStr in rawAttrs) {
          continue;
        }
        const partId = Number(partIdStr);
        const prevProps = prev[partId];
        let patch: Record<string, unknown> | undefined;
        for (const k in prevProps) {
          patch ??= {};
          patch[k] = undefined;
        }
        if (patch) {
          pushUpdate(this.instanceId, [
            ElementTemplateOpcodes.setAttributes,
            partId,
            patch,
          ]);
        }
      }

      this._attrs = next;
    } else if (key === 'id' && this instanceof BackgroundElementTemplateSlot) {
      this.partId = Number(value);
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
