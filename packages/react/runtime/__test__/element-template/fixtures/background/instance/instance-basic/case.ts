import { BackgroundElementTemplateInstance } from '../../../../../../src/element-template/background/instance.js';
import { backgroundElementTemplateInstanceManager } from '../../../../../../src/element-template/background/manager.js';

function resetManager(): void {
  backgroundElementTemplateInstanceManager.clear();
  backgroundElementTemplateInstanceManager.nextId = 0;
}

export function run() {
  resetManager();
  const instance = new BackgroundElementTemplateInstance('view');
  const create = { type: instance.type, id: instance.instanceId };

  resetManager();
  const instance1 = new BackgroundElementTemplateInstance('view');
  const instance2 = new BackgroundElementTemplateInstance('text');
  const increment = { ids: [instance1.instanceId, instance2.instanceId] };

  resetManager();
  const instance3 = new BackgroundElementTemplateInstance('view');
  const registered = backgroundElementTemplateInstanceManager.get(instance3.instanceId) === instance3;

  resetManager();
  const parent = new BackgroundElementTemplateInstance('view');
  const child = new BackgroundElementTemplateInstance('text');
  parent.appendChild(child);
  const parentId = parent.instanceId;
  const childId = child.instanceId;
  const before = {
    hasParent: backgroundElementTemplateInstanceManager.get(parentId) === parent,
    hasChild: backgroundElementTemplateInstanceManager.get(childId) === child,
    parentFirst: parent.firstChild?.instanceId ?? null,
    childParent: child.parent?.instanceId ?? null,
  };

  parent.tearDown();

  const after = {
    hasParent: backgroundElementTemplateInstanceManager.get(parentId) !== undefined,
    hasChild: backgroundElementTemplateInstanceManager.get(childId) !== undefined,
    parentFirst: parent.firstChild,
    childParent: child.parent,
  };

  return { create, increment, registered, tearDown: { parentId, childId, before, after } };
}
