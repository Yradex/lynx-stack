import { renderOpcodes, withElementTemplate } from '../_shared.js';

export function run() {
  return withElementTemplate(() => {
    const items = ['a', 'b'];
    const vnode = (
      <view>
        {items}
      </view>
    );
    const labels = new Map<object, string>([[vnode, 'vnode:root']]);

    return renderOpcodes(vnode, labels);
  });
}
