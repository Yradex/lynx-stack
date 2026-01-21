import { beforeEach, describe, expect, it, vi } from 'vitest';

import { root } from '../../../../src/element-template/index.js';
import { ElementTemplateEnvManager } from '../../test-utils/debug/envManager.js';

describe('ElementTemplate root render timing', () => {
  const envManager = new ElementTemplateEnvManager();

  beforeEach(() => {
    vi.clearAllMocks();
    envManager.resetEnv('background');
  });

  it('wraps background render with profile timing', () => {
    root.render(<view />);

    const { performance } = lynx;
    expect(performance.profileStart).toHaveBeenCalledWith('ReactLynx::renderBackground');
    expect(performance.profileEnd).toHaveBeenCalled();
  });
});
