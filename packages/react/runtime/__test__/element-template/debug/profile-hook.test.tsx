import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { root } from '../../../src/element-template/index.js';
import { initProfileHook } from '../../../src/element-template/debug/profile.js';
import { ElementTemplateEnvManager } from '../test-utils/debug/envManager.js';

describe('element-template initProfileHook', () => {
  const envManager = new ElementTemplateEnvManager();

  beforeAll(() => {
    initProfileHook();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    envManager.resetEnv('background');
  });

  it('profiles diff and render using displayName', () => {
    class ClassComponent {
      render() {
        return null;
      }

      static displayName = 'Clazz';
    }

    function Bar() {
      return <ClassComponent />;
    }
    Bar.displayName = 'Baz';

    function Foo() {
      return <Bar />;
    }

    root.render(<Foo />);

    expect(lynx.performance.profileStart).toHaveBeenCalledWith('ReactLynx::render::Foo');
    expect(lynx.performance.profileStart).not.toHaveBeenCalledWith('ReactLynx::render::Bar');
    expect(lynx.performance.profileStart).toHaveBeenCalledWith('ReactLynx::render::Baz');
    expect(lynx.performance.profileStart).not.toHaveBeenCalledWith('ReactLynx::render::ClassComponent');
    expect(lynx.performance.profileStart).toHaveBeenCalledWith('ReactLynx::render::Clazz');

    expect(lynx.performance.profileStart).toHaveBeenCalledWith('ReactLynx::diff::Foo', {});
    expect(lynx.performance.profileStart).not.toHaveBeenCalledWith('ReactLynx::diff::Bar');
    expect(lynx.performance.profileStart).toHaveBeenCalledWith('ReactLynx::diff::Baz', {});
    expect(lynx.performance.profileStart).not.toHaveBeenCalledWith('ReactLynx::diff::ClassComponent');
    expect(lynx.performance.profileStart).toHaveBeenCalledWith('ReactLynx::diff::Clazz', {});
  });
});
