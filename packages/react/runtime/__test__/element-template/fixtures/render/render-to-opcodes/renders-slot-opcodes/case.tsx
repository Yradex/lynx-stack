import { renderOpcodes, withElementTemplate } from '../_shared.js';

export function run() {
  return withElementTemplate(() => {
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

    return renderOpcodes(vnode, labels);
  });
}
