import {
  BackgroundElementTemplateInstance,
  GlobalCommitContext,
  resetGlobalCommitContext,
  runCase,
} from '../../_shared.js';

export function run() {
  return runCase(() => {
    const instance = new BackgroundElementTemplateInstance('view');
    instance.setAttribute('attrs', { 0: { a: 1 } });
    resetGlobalCommitContext();

    instance.setAttribute('attrs', { 0: null } as unknown as Record<string, unknown>);
    const stream = GlobalCommitContext.patches;
    resetGlobalCommitContext();

    return stream;
  });
}
