import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { root } from '../../../../src/element-template/index.js';
import { __root, setRoot } from '../../../../src/element-template/runtime/page/root-instance.js';
import { BackgroundElementTemplateInstance } from '../../../../src/element-template/background/instance.js';
import { serializeBackgroundTree } from '../../test-utils/serializer.js';
import { backgroundElementTemplateInstanceManager } from '../../../../src/element-template/background/manager.js';

describe('Background Rendering', () => {
  beforeEach(() => {
    vi.stubGlobal('__BACKGROUND__', true);
    backgroundElementTemplateInstanceManager.clear();
    backgroundElementTemplateInstanceManager.nextId = 0;
    // Re-initialize root for background
    setRoot(new BackgroundElementTemplateInstance('root'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should construct shadow tree in background when root.render is called', () => {
    function App() {
      return (
        <view id='main'>
          <text>Hello Background</text>
        </view>
      );
    }

    root.render(<App />);

    // Verify __root
    expect(__root).toBeInstanceOf(BackgroundElementTemplateInstance);

    expect(serializeBackgroundTree(__root)).toMatchInlineSnapshot(`
      "<root>
        <_et_a94a8_test_1 />
      </root>
      "
    `);
  });

  it('should support Slot component materiality in background', () => {
    function Sub(props: any) {
      return <view>{props.children}</view>;
    }
    function App() {
      return (
        <view>
          <Sub>
            <text>Slot Content 1</text>
          </Sub>
          <Sub>
            <text>Slot Content 2</text>
          </Sub>
        </view>
      );
    }

    root.render(<App />);

    expect(serializeBackgroundTree(__root)).toMatchInlineSnapshot(`
      "<root>
        <_et_a94a8_test_3>
          <slot id=0>
            <_et_a94a8_test_2>
              <slot id=0>
                <_et_a94a8_test_4 />
              </slot>
            </_et_a94a8_test_2>
            <_et_a94a8_test_2>
              <slot id=0>
                <_et_a94a8_test_5 />
              </slot>
            </_et_a94a8_test_2>
          </slot>
        </_et_a94a8_test_3>
      </root>
      "
    `);
  });
});
