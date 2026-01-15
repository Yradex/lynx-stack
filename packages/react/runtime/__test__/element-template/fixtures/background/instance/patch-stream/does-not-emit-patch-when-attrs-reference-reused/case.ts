import {
  BackgroundElementTemplateInstance,
  GlobalCommitContext,
  resetGlobalCommitContext,
  runCase,
} from '../../_shared.js';

export function run() {
  return runCase(() => {
    const instance = new BackgroundElementTemplateInstance('view');
    const props = { a: 1 };
    instance.setAttribute('attrs', { 0: props });
    resetGlobalCommitContext();

    instance.setAttribute('attrs', { 0: props });
    const stream = GlobalCommitContext.patches;
    resetGlobalCommitContext();

    return stream;
  });
}
