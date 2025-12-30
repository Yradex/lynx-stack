import { describe, expect, it } from 'vitest';

import { SnapshotInstance } from '../../../src/element-template/internal.js';

describe('SnapshotInstance', () => {
  it('should throw error on instantiation', () => {
    expect(() => new SnapshotInstance('div')).toThrowError(
      'SnapshotInstance should not be instantiated when using Element Template.',
    );
  });
});
