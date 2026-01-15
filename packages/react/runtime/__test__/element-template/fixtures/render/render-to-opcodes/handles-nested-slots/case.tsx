import { renderOpcodes, withElementTemplate } from '../_shared.js';

export function run() {
  return withElementTemplate(() => {
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

    return renderOpcodes(vnode, labels);
  });
}
