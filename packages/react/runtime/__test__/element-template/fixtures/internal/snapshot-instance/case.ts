import { SnapshotInstance } from '../../../../../src/element-template/internal.js';

export function run() {
  let message: string | null = null;
  try {
    // eslint-disable-next-line no-new
    new SnapshotInstance('div');
  } catch (error) {
    message = error instanceof Error ? error.message : String(error);
  }

  return { message };
}
