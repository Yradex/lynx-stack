import { __etSlot } from '@lynx-js/react/element-template/internal';
import { renderOpcodes, withElementTemplate } from '../_shared.js';

export function run() {
  return withElementTemplate(() => {
    const _et_test = '_et_test';
    const test = 'test';
    const hello = 'Hello';
    const vnode = (
      <_et_test attributeSlots={[test]}>
        {__etSlot(1, hello)}
      </_et_test>
    );
    const labels = new Map<object, string>([[vnode, 'vnode:root']]);

    return renderOpcodes(vnode, labels);
  });
}
