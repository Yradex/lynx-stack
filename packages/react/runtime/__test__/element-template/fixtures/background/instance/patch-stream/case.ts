import { vi } from 'vitest';

import {
  GlobalCommitContext,
  resetGlobalCommitContext,
} from '../../../../../../src/element-template/background/commit-context.js';
import {
  BackgroundElementTemplateInstance,
  BackgroundElementTemplateSlot,
} from '../../../../../../src/element-template/background/instance.js';
import { backgroundElementTemplateInstanceManager } from '../../../../../../src/element-template/background/manager.js';

function resetManager(): void {
  backgroundElementTemplateInstanceManager.clear();
  backgroundElementTemplateInstanceManager.nextId = 0;
}

export const skipReportErrorCheck = true;

export function run() {
  resetManager();
  resetGlobalCommitContext();
  const instance = new BackgroundElementTemplateInstance('view');
  instance.setAttribute('attrs', { 0: { a: 1 } });
  resetGlobalCommitContext();
  instance.setAttribute('attrs', { 0: null } as unknown as Record<string, unknown>);
  const nonObjectAttrs = GlobalCommitContext.patches;
  resetGlobalCommitContext();

  resetManager();
  const instanceReuse = new BackgroundElementTemplateInstance('view');
  const props = { a: 1 };
  instanceReuse.setAttribute('attrs', { 0: props });
  resetGlobalCommitContext();
  instanceReuse.setAttribute('attrs', { 0: props });
  const reuseProps = GlobalCommitContext.patches;
  resetGlobalCommitContext();

  resetManager();
  const instanceNullish = new BackgroundElementTemplateInstance('view');
  instanceNullish.setAttribute('attrs', { 0: { a: 1 } });
  resetGlobalCommitContext();
  instanceNullish.setAttribute('attrs', undefined as unknown as Record<string, unknown>);
  const nullishAttrs = GlobalCommitContext.patches;
  resetGlobalCommitContext();

  resetManager();
  const root = new BackgroundElementTemplateInstance('root');
  const slot = new BackgroundElementTemplateSlot();
  slot.setAttribute('id', 0);
  root.appendChild(slot);
  const child = new BackgroundElementTemplateInstance('view');
  slot.insertBefore(child, null, true);
  const silentInsert = GlobalCommitContext.patches;
  resetGlobalCommitContext();

  resetManager();
  const lynxObj = globalThis.lynx as typeof lynx & { reportError?: (error: Error) => void };
  const oldReportError = lynxObj.reportError;
  const reportErrorSpy = vi.fn();
  lynxObj.reportError = reportErrorSpy;
  const instanceError = new BackgroundElementTemplateInstance('view');
  instanceError.instanceId = 0;
  instanceError.emitCreate();
  const reportErrorCalls = reportErrorSpy.mock.calls.length;
  const reportErrorMessage = reportErrorSpy.mock.calls[0]?.[0]?.message ?? null;
  lynxObj.reportError = oldReportError;

  return {
    nonObjectAttrs,
    reuseProps,
    nullishAttrs,
    silentInsert,
    reportError: { calls: reportErrorCalls, message: reportErrorMessage },
  };
}
