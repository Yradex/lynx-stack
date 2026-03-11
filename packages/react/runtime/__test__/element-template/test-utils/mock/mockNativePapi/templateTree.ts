function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

const elementTemplateParentListByNodeRef = new WeakMap<object, unknown[]>();

export interface CompiledTemplateNode {
  tag?: string;
  templateId?: string;
  attributes?: Record<string, unknown>;
  parts?: Record<string, unknown>;
  children?: unknown[];
  type?: string;
  text?: string;
}

interface CompiledAttributeDescriptor {
  kind: 'attribute' | 'spread';
  binding: 'static' | 'slot';
  key?: string;
  value?: unknown;
  attrSlotIndex?: number;
}

interface CompiledElementNode {
  kind: 'element';
  tag: string;
  attributes?: CompiledAttributeDescriptor[];
  children?: CompiledTemplateChild[];
}

interface CompiledElementSlotNode {
  kind: 'elementSlot';
  elementSlotIndex: number;
}

type CompiledTemplateChild = CompiledElementNode | CompiledElementSlotNode;

function getPartId(node: Record<string, unknown>): number | undefined {
  const attrs = node['attributes'];
  if (isRecord(attrs)) {
    const partId = attrs['part-id'];
    if (typeof partId === 'string' || typeof partId === 'number') {
      return Number(partId);
    }
  }

  const parts = node['parts'];
  if (isRecord(parts)) {
    const partId = parts['part-id'];
    if (typeof partId === 'string' || typeof partId === 'number') {
      return Number(partId);
    }
  }

  return undefined;
}

function getNodeAttrsForWrite(node: CompiledTemplateNode): Record<string, unknown> {
  if (isRecord(node.attributes)) {
    return node.attributes;
  }
  node.attributes = {};
  return node.attributes;
}

function collectNodesByPartId(root: unknown): Map<number, CompiledTemplateNode> {
  const nodesByPartId = new Map<number, CompiledTemplateNode>();

  const collect = (node: unknown) => {
    if (!isRecord(node)) {
      return;
    }

    const partId = getPartId(node);
    if (typeof partId === 'number') {
      nodesByPartId.set(partId, node as CompiledTemplateNode);
    }

    if (node !== root && typeof node['templateId'] === 'string') {
      return;
    }

    const children = node['children'];
    if (isUnknownArray(children)) {
      for (const child of children) {
        collect(child);
      }
    }
  };

  collect(root);
  return nodesByPartId;
}

export function applyOpcodesToTemplateInstance(root: CompiledTemplateNode, opcodes: unknown): void {
  if (!isUnknownArray(opcodes)) {
    return;
  }

  const nodesByPartId = collectNodesByPartId(root);

  for (let i = 0; i < opcodes.length;) {
    const opcode = opcodes[i];

    if (opcode === 4) {
      const partId = opcodes[i + 1];
      const patch = opcodes[i + 2];
      const target = (typeof partId === 'string' || typeof partId === 'number')
        ? nodesByPartId.get(Number(partId))
        : undefined;
      if (target && isRecord(patch)) {
        const attrs = getNodeAttrsForWrite(target);
        for (const [key, value] of Object.entries(patch)) {
          if (value === undefined) {
            delete attrs[key];
          } else {
            attrs[key] = value;
          }
        }
      }
      i += 3;
      continue;
    }

    if (opcode === 2) {
      const slotId = opcodes[i + 1];
      const beforeRef = opcodes[i + 2];
      const childRef = opcodes[i + 3];

      if (isRecord(childRef)) {
        const previousList = elementTemplateParentListByNodeRef.get(childRef);
        if (previousList) {
          const previousIndex = previousList.indexOf(childRef);
          if (previousIndex >= 0) {
            previousList.splice(previousIndex, 1);
          }
        }
      }

      const slot = (typeof slotId === 'string' || typeof slotId === 'number')
        ? nodesByPartId.get(Number(slotId))
        : undefined;

      if (!slot || slot.tag !== 'slot' || childRef == null) {
        i += 4;
        continue;
      }

      slot.children ??= [];
      const list = slot.children;

      const existingIndex = list.indexOf(childRef);
      if (existingIndex >= 0) {
        list.splice(existingIndex, 1);
      }

      if (beforeRef == null) {
        list.push(childRef);
      } else {
        const beforeIndex = list.indexOf(beforeRef);
        if (beforeIndex >= 0) {
          list.splice(beforeIndex, 0, childRef);
        } else {
          list.push(childRef);
        }
      }

      if (isRecord(childRef)) {
        elementTemplateParentListByNodeRef.set(childRef, list);
      }

      i += 4;
      continue;
    }

    if (opcode === 3) {
      const slotId = opcodes[i + 1];
      const childRef = opcodes[i + 2];
      const slot = (typeof slotId === 'string' || typeof slotId === 'number')
        ? nodesByPartId.get(Number(slotId))
        : undefined;

      if (slot?.tag === 'slot' && slot.children && childRef != null) {
        const index = slot.children.indexOf(childRef);
        if (index >= 0) {
          slot.children.splice(index, 1);
        }
      }

      if (isRecord(childRef)) {
        elementTemplateParentListByNodeRef.delete(childRef);
      }

      i += 3;
      continue;
    }

    i += 1;
  }
}

function isCompiledElementNode(node: unknown): node is CompiledElementNode {
  return isRecord(node) && node['kind'] === 'element' && typeof node['tag'] === 'string';
}

function isCompiledElementSlotNode(node: unknown): node is CompiledElementSlotNode {
  return isRecord(node) && node['kind'] === 'elementSlot' && typeof node['elementSlotIndex'] === 'number';
}

function applyCompiledAttributes(
  node: CompiledElementNode,
  attributeSlots: unknown[] | null | undefined,
): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};

  for (const descriptor of node.attributes ?? []) {
    if (descriptor.kind === 'attribute') {
      if (descriptor.binding === 'static') {
        if (descriptor.key) {
          attributes[descriptor.key] = descriptor.value;
        }
        continue;
      }

      if (descriptor.key) {
        const slotValue = attributeSlots?.[descriptor.attrSlotIndex ?? -1];
        if (slotValue !== null && slotValue !== undefined) {
          attributes[descriptor.key] = slotValue;
        }
      }
      continue;
    }

    const spreadValue = attributeSlots?.[descriptor.attrSlotIndex ?? -1];
    if (isRecord(spreadValue)) {
      Object.assign(attributes, spreadValue);
    }
  }

  return attributes;
}

function instantiateCompiledTemplateChild(
  child: CompiledTemplateChild,
  attributeSlots: unknown[] | null | undefined,
  elementSlots: unknown[][] | null | undefined,
): unknown {
  if (isCompiledElementSlotNode(child)) {
    return {
      tag: 'slot',
      attributes: { 'slot-id': child.elementSlotIndex },
      children: [...(elementSlots?.[child.elementSlotIndex] ?? [])],
    };
  }

  return instantiateCompiledTemplateNode(child, attributeSlots, elementSlots);
}

export function instantiateCompiledTemplateNode(
  node: CompiledElementNode,
  attributeSlots: unknown[] | null | undefined,
  elementSlots: unknown[][] | null | undefined,
): CompiledTemplateNode {
  const instantiatedChildren: unknown[] = [];
  for (const child of node.children ?? []) {
    instantiatedChildren.push(
      instantiateCompiledTemplateChild(child, attributeSlots, elementSlots),
    );
  }

  return {
    tag: node.tag,
    attributes: applyCompiledAttributes(node, attributeSlots),
    children: instantiatedChildren,
  };
}

export function instantiateCompiledTemplate(
  template: unknown,
  attributeSlots: unknown[] | null | undefined,
  elementSlots: unknown[][] | null | undefined,
): CompiledTemplateNode {
  if (!isCompiledElementNode(template)) {
    throw new Error('ElementTemplate: __CreateElementTemplate expects the new compiled template schema.');
  }

  return instantiateCompiledTemplateNode(template, attributeSlots, elementSlots);
}

export function formatOpcodes(ops: unknown): unknown {
  if (!isUnknownArray(ops)) return ops;
  const res: unknown[] = [];
  for (let i = 0; i < ops.length;) {
    const opcode = ops[i];
    if (opcode === 4) {
      res.push({
        type: 'setAttributes',
        id: ops[i + 1],
        attributes: ops[i + 2],
      });
      i += 3;
    } else if (opcode === 2) {
      res.push({
        type: 'insertBefore',
        id: ops[i + 1],
        node: ops[i + 3],
      });
      i += 4;
    } else if (opcode === 3) {
      res.push({
        type: 'removeChild',
        id: ops[i + 1],
        node: ops[i + 2],
      });
      i += 3;
    } else {
      res.push(opcode);
      i += 1;
    }
  }
  return res;
}

export function formatNode(node: unknown): string {
  if (typeof node === 'string') {
    return node;
  }
  if (isRecord(node)) {
    const templateId = node['templateId'];
    const tag = node['tag'];
    const displayTag = typeof templateId === 'string'
      ? templateId
      : (typeof tag === 'string' ? tag : undefined);
    if (displayTag) {
      return `<${displayTag} />`;
    }

    const text = node['text'];
    if (typeof text === 'string') {
      return `"${text}"`;
    }

    const id = node['id'];
    if (typeof id === 'string' || typeof id === 'number') {
      return String(id);
    }

    const type = node['type'];
    if (typeof type === 'string') {
      return type;
    }
  }
  return String(node);
}

export function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

export function isRecordForMock(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

export function isUnknownArrayForMock(value: unknown): value is unknown[] {
  return isUnknownArray(value);
}
