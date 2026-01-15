import { BackgroundElementTemplateInstance } from '../../../../../../src/element-template/background/instance.js';
import { backgroundElementTemplateInstanceManager } from '../../../../../../src/element-template/background/manager.js';

function resetManager(): void {
  backgroundElementTemplateInstanceManager.clear();
  backgroundElementTemplateInstanceManager.nextId = 0;
}

function listIds(node: BackgroundElementTemplateInstance | null): number[] {
  const ids: number[] = [];
  let current = node;
  while (current) {
    ids.push(current.instanceId);
    current = current.nextSibling as BackgroundElementTemplateInstance | null;
  }
  return ids;
}

export function run() {
  resetManager();
  const parent = new BackgroundElementTemplateInstance('view');
  const child1 = new BackgroundElementTemplateInstance('text');
  const child2 = new BackgroundElementTemplateInstance('image');
  parent.appendChild(child1);
  parent.insertBefore(child2, child1);
  const insertBefore = {
    parentFirst: parent.firstChild?.instanceId ?? null,
    parentLast: parent.lastChild?.instanceId ?? null,
    child2Next: child2.nextSibling?.instanceId ?? null,
    child1Prev: child1.previousSibling?.instanceId ?? null,
  };

  resetManager();
  const parent2 = new BackgroundElementTemplateInstance('view');
  const child = new BackgroundElementTemplateInstance('text');
  parent2.insertBefore(child, null);
  const appendIfNull = {
    parentFirst: parent2.firstChild?.instanceId ?? null,
    parentLast: parent2.lastChild?.instanceId ?? null,
  };

  resetManager();
  const parent3 = new BackgroundElementTemplateInstance('view');
  const a = new BackgroundElementTemplateInstance('text');
  const b = new BackgroundElementTemplateInstance('image');
  parent3.appendChild(a);
  parent3.appendChild(b);
  parent3.insertBefore(b, a);
  const moveExisting = {
    order: listIds(parent3.firstChild as BackgroundElementTemplateInstance | null),
    first: parent3.firstChild?.instanceId ?? null,
    last: parent3.lastChild?.instanceId ?? null,
    bNext: b.nextSibling?.instanceId ?? null,
  };

  resetManager();
  const parent4 = new BackgroundElementTemplateInstance('view');
  const c1 = new BackgroundElementTemplateInstance('text');
  const c2 = new BackgroundElementTemplateInstance('image');
  const c3 = new BackgroundElementTemplateInstance('view');
  parent4.appendChild(c1);
  parent4.appendChild(c2);
  parent4.insertBefore(c3, c2);
  const insertBetween = {
    order: listIds(parent4.firstChild as BackgroundElementTemplateInstance | null),
    c1Next: c1.nextSibling?.instanceId ?? null,
    c3Prev: c3.previousSibling?.instanceId ?? null,
    c3Next: c3.nextSibling?.instanceId ?? null,
    c2Prev: c2.previousSibling?.instanceId ?? null,
  };

  resetManager();
  const parentA = new BackgroundElementTemplateInstance('view');
  const parentB = new BackgroundElementTemplateInstance('view');
  const b1 = new BackgroundElementTemplateInstance('text');
  const b2 = new BackgroundElementTemplateInstance('image');
  const mover = new BackgroundElementTemplateInstance('view');
  parentA.appendChild(mover);
  parentB.appendChild(b1);
  parentB.appendChild(b2);
  parentB.insertBefore(mover, b2);
  const reparent = {
    parentAFirst: parentA.firstChild?.instanceId ?? null,
    parentALast: parentA.lastChild?.instanceId ?? null,
    order: listIds(parentB.firstChild as BackgroundElementTemplateInstance | null),
    moverParent: mover.parent?.instanceId ?? null,
  };

  return { insertBefore, appendIfNull, moveExisting, insertBetween, reparent };
}
