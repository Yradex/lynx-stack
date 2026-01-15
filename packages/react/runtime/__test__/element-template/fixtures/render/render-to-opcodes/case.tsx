import { renderToString } from '../../../../../src/renderToOpcodes/index';

type LabelMap = Map<object, string>;

function normalizeType(type: unknown): string {
  if (typeof type === 'string' && type.startsWith('_et_')) {
    return '_et_*';
  }
  if (typeof type === 'function') {
    return type.name || '<anonymous>';
  }
  return String(type);
}

function formatOpcodeItem(item: unknown, labels: LabelMap): unknown {
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

function formatOpcodes(opcodes: unknown[], labels: LabelMap): unknown[] {
  return opcodes.map(item => formatOpcodeItem(item, labels));
}

function withElementTemplate<T>(runner: () => T): T {
  const original = (globalThis as { __USE_ELEMENT_TEMPLATE__?: boolean }).__USE_ELEMENT_TEMPLATE__;
  (globalThis as { __USE_ELEMENT_TEMPLATE__?: boolean }).__USE_ELEMENT_TEMPLATE__ = true;
  try {
    return runner();
  } finally {
    (globalThis as { __USE_ELEMENT_TEMPLATE__?: boolean }).__USE_ELEMENT_TEMPLATE__ = original;
  }
}

export function run(): Record<string, unknown> {
  return {
    'renders-slot-opcodes': withElementTemplate(() => {
      const child = <text>hello</text>;
      const vnode = (
        <view>
          {child}
        </view>
      );
      const labels = new Map<object, string>([
        [vnode, 'vnode:root'],
        [child, 'vnode:child'],
      ]);

      const opcodes = renderToString(vnode);
      return formatOpcodes(opcodes, labels);
    }),
    'handles-nested-slots': withElementTemplate(() => {
      const innerChild = <text>nested</text>;
      const inner = <view>{innerChild}</view>;
      const vnode = (
        <view>
          {inner}
        </view>
      );
      const labels = new Map<object, string>([
        [vnode, 'vnode:root'],
        [inner, 'vnode:inner'],
        [innerChild, 'vnode:inner-child'],
      ]);

      const opcodes = renderToString(vnode);
      return formatOpcodes(opcodes, labels);
    }),
    'renders-multiple-children-in-order': withElementTemplate(() => {
      const items = ['a', 'b'];
      const vnode = (
        <view>
          {items}
        </view>
      );
      const labels = new Map<object, string>([[vnode, 'vnode:root']]);

      const opcodes = renderToString(vnode);
      return formatOpcodes(opcodes, labels);
    }),
    'renders-jsx-map-result-in-order': withElementTemplate(() => {
      const items = [1, 2, 3];
      const mapped = items.map(() => <view></view>);
      const vnode = (
        <view>
          {mapped}
        </view>
      );
      const labels = new Map<object, string>([[vnode, 'vnode:root']]);
      mapped.forEach((item, index) => {
        labels.set(item, `vnode:item-${index}`);
      });

      const opcodes = renderToString(vnode);
      return formatOpcodes(opcodes, labels);
    }),
    'renders-array-map-result-in-order': withElementTemplate(() => {
      const items = [1, 2, 3];
      const vnode = (
        <view>
          {items.map(i => i + '')}
        </view>
      );
      const labels = new Map<object, string>([[vnode, 'vnode:root']]);

      const opcodes = renderToString(vnode);
      return formatOpcodes(opcodes, labels);
    }),
    'renders-custom-component-wrapped-in-slot': withElementTemplate(() => {
      function CustomComponent({ children }: { children: any }) {
        return (
          <view>
            <text>custom</text>
            {children}
          </view>
        );
      }

      const child = <text>child</text>;
      const vnode = (
        <view>
          <CustomComponent>
            {child}
          </CustomComponent>
        </view>
      );
      const labels = new Map<object, string>([
        [vnode, 'vnode:root'],
        [child, 'vnode:child'],
      ]);

      const opcodes = renderToString(vnode);
      return formatOpcodes(opcodes, labels);
    }),
    'renders-attrs-and-slot-opcodes': withElementTemplate(() => {
      const test = 'test';
      const hello = 'Hello';
      const vnode = (
        <view id={test}>
          {hello}
        </view>
      );
      const labels = new Map<object, string>([[vnode, 'vnode:root']]);

      const opcodes = renderToString(vnode);
      return formatOpcodes(opcodes, labels);
    }),
  };
}
