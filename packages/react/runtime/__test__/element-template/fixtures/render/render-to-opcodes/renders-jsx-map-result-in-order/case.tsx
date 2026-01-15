import { renderOpcodes, withElementTemplate } from '../_shared.js';

export function run() {
  return withElementTemplate(() => {
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

    return renderOpcodes(vnode, labels);
  });
}
