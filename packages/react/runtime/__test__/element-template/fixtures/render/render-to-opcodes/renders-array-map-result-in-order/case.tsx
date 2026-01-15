import { renderOpcodes, withElementTemplate } from '../_shared.js';

export function run() {
  return withElementTemplate(() => {
    const items = [1, 2, 3];
    const vnode = (
      <view>
        {items.map(i => i + '')}
      </view>
    );
    const labels = new Map<object, string>([[vnode, 'vnode:root']]);

    return renderOpcodes(vnode, labels);
  });
}
