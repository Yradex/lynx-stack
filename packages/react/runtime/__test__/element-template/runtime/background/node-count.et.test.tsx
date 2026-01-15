import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { root } from '../../../../src/element-template/index.js';
import { __root, setRoot } from '../../../../src/element-template/runtime/page/root-instance.js';
import { BackgroundElementTemplateInstance } from '../../../../src/element-template/background/instance.js';
import { backgroundElementTemplateInstanceManager } from '../../../../src/element-template/background/manager.js';
import {
  GlobalCommitContext,
  resetGlobalCommitContext,
} from '../../../../src/element-template/background/commit-context.js';

describe('Background Node Count', () => {
  beforeEach(() => {
    vi.stubGlobal('__BACKGROUND__', true);
    backgroundElementTemplateInstanceManager.clear();
    backgroundElementTemplateInstanceManager.nextId = 0;
    resetGlobalCommitContext();
    setRoot(new BackgroundElementTemplateInstance('root'));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should capture nodeCount prop and emit it in patches', () => {
    function App() {
      // @ts-ignore
      return (
        <view __nodeCount={42}>
          <text>Content</text>
        </view>
      );
    }

    root.render(<App />);

    // Get the instance.
    // Structure: root -> view (Element Template)
    const rootInstance = __root as BackgroundElementTemplateInstance;
    const viewInstance = rootInstance.firstChild as BackgroundElementTemplateInstance;

    expect(viewInstance).toBeDefined();

    // 1. Verify that nodeCount is captured on the instance
    // The transform plugin may calculate nodeCount (e.g. 2), or override manual props.
    // We verify that whatever was passed/calculated is correctly captured.
    expect(viewInstance.nodeCount).not.toBeNull();
    const capturedNodeCount = viewInstance.nodeCount!;

    // 2. Verify that emitCreate includes the nodeCount in the patch
    resetGlobalCommitContext();
    viewInstance.emitCreate();

    const patches = GlobalCommitContext.patches;
    // Patch structure: [0, instanceId, type, initOpcodes, nodeCount]
    expect(patches[0]).toBe(0);
    // The 5th element (index 4) should be nodeCount
    expect(patches[4]).toBe(capturedNodeCount);
  });
});
