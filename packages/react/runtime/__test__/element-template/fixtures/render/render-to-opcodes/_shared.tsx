import { renderToString } from '../../../../../src/renderToOpcodes/index.js';

export type LabelMap = Map<object, string>;

export function normalizeType(type: unknown): string {
  if (typeof type === 'string' && type.startsWith('_et_')) {
    return '_et_*';
  }
  if (typeof type === 'function') {
    return type.name || '<anonymous>';
  }
  return String(type);
}

export function formatOpcodeItem(item: unknown, labels: LabelMap): unknown {
  if (item && typeof item === 'object') {
    const label = labels.get(item as object);
    if (label) {
      return label;
    }
    if ('type' in (item as { type?: unknown })) {
      return { type: normalizeType((item as { type?: unknown }).type) };
    }
  }
  return item;
}

export function formatOpcodes(opcodes: unknown[], labels: LabelMap): unknown[] {
  return opcodes.map(item => formatOpcodeItem(item, labels));
}

export function formatLabels(labels: LabelMap): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const [node, label] of labels) {
    if (node && typeof node === 'object' && 'type' in (node as { type?: unknown })) {
      entries[label] = normalizeType((node as { type?: unknown }).type);
    } else {
      entries[label] = String(node);
    }
  }
  return entries;
}

export function withElementTemplate<T>(runner: () => T): T {
  const original = (globalThis as { __USE_ELEMENT_TEMPLATE__?: boolean }).__USE_ELEMENT_TEMPLATE__;
  (globalThis as { __USE_ELEMENT_TEMPLATE__?: boolean }).__USE_ELEMENT_TEMPLATE__ = true;
  try {
    return runner();
  } finally {
    (globalThis as { __USE_ELEMENT_TEMPLATE__?: boolean }).__USE_ELEMENT_TEMPLATE__ = original;
  }
}

export function renderOpcodes(vnode: JSX.Element, labels: LabelMap): {
  output: unknown[];
  files: { 'labels.txt': Record<string, string> };
} {
  const opcodes = renderToString(vnode);
  return {
    output: formatOpcodes(opcodes, labels),
    files: {
      'labels.txt': formatLabels(labels),
    },
  };
}
