import { renderOpcodes, withElementTemplate } from '../_shared.js';

export function run() {
  return withElementTemplate(() => {
    const test = 'test';
    const hello = 'Hello';
    const vnode = (
      <view id={test}>
        {hello}
      </view>
    );
    const labels = new Map<object, string>([[vnode, 'vnode:root']]);

    return renderOpcodes(vnode, labels);
  });
}
