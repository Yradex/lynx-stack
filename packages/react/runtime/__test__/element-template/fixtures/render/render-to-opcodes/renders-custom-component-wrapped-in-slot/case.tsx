import { renderOpcodes, withElementTemplate } from '../_shared.js';

export function run() {
  return withElementTemplate(() => {
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

    return renderOpcodes(vnode, labels);
  });
}
