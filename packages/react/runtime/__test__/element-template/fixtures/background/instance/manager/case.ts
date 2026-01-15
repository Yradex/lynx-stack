import { BackgroundElementTemplateInstance } from '../../../../../../src/element-template/background/instance.js';
import { backgroundElementTemplateInstanceManager } from '../../../../../../src/element-template/background/manager.js';

function resetManager(): void {
  backgroundElementTemplateInstanceManager.clear();
  backgroundElementTemplateInstanceManager.nextId = 0;
}

export function run() {
  resetManager();
  const instance1 = new BackgroundElementTemplateInstance('view');
  const instance2 = new BackgroundElementTemplateInstance('text');
  const register = {
    ids: [instance1.instanceId, instance2.instanceId],
    ordered: instance2.instanceId > instance1.instanceId,
    has: [
      backgroundElementTemplateInstanceManager.get(instance1.instanceId) === instance1,
      backgroundElementTemplateInstanceManager.get(instance2.instanceId) === instance2,
    ],
  };

  resetManager();
  const instance = new BackgroundElementTemplateInstance('view');
  const oldId = instance.instanceId;
  const newId = 10001;
  backgroundElementTemplateInstanceManager.updateId(oldId, newId);
  const update = {
    oldId,
    newId,
    instanceId: instance.instanceId,
    hasOld: backgroundElementTemplateInstanceManager.get(oldId) !== undefined,
    hasNew: backgroundElementTemplateInstanceManager.get(newId) === instance,
  };

  resetManager();
  const instance3 = new BackgroundElementTemplateInstance('view');
  const beforeClear = backgroundElementTemplateInstanceManager.get(instance3.instanceId) === instance3;
  backgroundElementTemplateInstanceManager.clear();
  const clear = {
    beforeClear,
    afterClear: backgroundElementTemplateInstanceManager.get(instance3.instanceId) === undefined,
    size: backgroundElementTemplateInstanceManager.values.size,
  };

  return { register, update, clear };
}
