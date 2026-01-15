import { BackgroundElementTemplateInstance } from '../../../../../../src/element-template/background/instance.js';
import { backgroundElementTemplateInstanceManager } from '../../../../../../src/element-template/background/manager.js';

function resetManager(): void {
  backgroundElementTemplateInstanceManager.clear();
  backgroundElementTemplateInstanceManager.nextId = 0;
}

export function run() {
  resetManager();
  const parent = new BackgroundElementTemplateInstance('view');
  const child = new BackgroundElementTemplateInstance('text');
  parent.appendChild(child);
  const single = {
    parentFirst: parent.firstChild?.instanceId ?? null,
    parentLast: parent.lastChild?.instanceId ?? null,
    childParent: child.parent?.instanceId ?? null,
  };

  resetManager();
  const parent2 = new BackgroundElementTemplateInstance('view');
  const child1 = new BackgroundElementTemplateInstance('text');
  const child2 = new BackgroundElementTemplateInstance('image');
  parent2.appendChild(child1);
  parent2.appendChild(child2);
  const multiple = {
    parentFirst: parent2.firstChild?.instanceId ?? null,
    parentLast: parent2.lastChild?.instanceId ?? null,
    child1Next: child1.nextSibling?.instanceId ?? null,
    child2Prev: child2.previousSibling?.instanceId ?? null,
  };

  resetManager();
  const parentA = new BackgroundElementTemplateInstance('view');
  const parentB = new BackgroundElementTemplateInstance('view');
  const mover = new BackgroundElementTemplateInstance('text');
  parentA.appendChild(mover);
  parentB.appendChild(mover);
  const reparent = {
    parentAFirst: parentA.firstChild?.instanceId ?? null,
    parentALast: parentA.lastChild?.instanceId ?? null,
    parentBFirst: parentB.firstChild?.instanceId ?? null,
    parentBLast: parentB.lastChild?.instanceId ?? null,
    moverParent: mover.parent?.instanceId ?? null,
  };

  return { single, multiple, reparent };
}
