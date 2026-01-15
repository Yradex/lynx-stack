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
  const child = new BackgroundElementTemplateInstance('text');
  parent.appendChild(child);
  parent.removeChild(child);
  const removeSingle = {
    parentFirst: parent.firstChild?.instanceId ?? null,
    parentLast: parent.lastChild?.instanceId ?? null,
    childParent: child.parent?.instanceId ?? null,
  };

  resetManager();
  const parent2 = new BackgroundElementTemplateInstance('view');
  const child1 = new BackgroundElementTemplateInstance('text');
  const child2 = new BackgroundElementTemplateInstance('image');
  const child3 = new BackgroundElementTemplateInstance('view');
  parent2.appendChild(child1);
  parent2.appendChild(child2);
  parent2.appendChild(child3);
  parent2.removeChild(child2);
  const removeMiddle = {
    order: listIds(parent2.firstChild as BackgroundElementTemplateInstance | null),
    child1Next: child1.nextSibling?.instanceId ?? null,
    child3Prev: child3.previousSibling?.instanceId ?? null,
    parentFirst: parent2.firstChild?.instanceId ?? null,
    parentLast: parent2.lastChild?.instanceId ?? null,
  };

  resetManager();
  const parent3 = new BackgroundElementTemplateInstance('view');
  const first = new BackgroundElementTemplateInstance('text');
  const second = new BackgroundElementTemplateInstance('image');
  parent3.appendChild(first);
  parent3.appendChild(second);
  parent3.removeChild(first);
  const removeFirst = {
    parentFirst: parent3.firstChild?.instanceId ?? null,
    parentLast: parent3.lastChild?.instanceId ?? null,
    secondPrev: second.previousSibling?.instanceId ?? null,
  };

  resetManager();
  const parent4 = new BackgroundElementTemplateInstance('view');
  const head = new BackgroundElementTemplateInstance('text');
  const tail = new BackgroundElementTemplateInstance('image');
  parent4.appendChild(head);
  parent4.appendChild(tail);
  parent4.removeChild(tail);
  const removeLast = {
    parentFirst: parent4.firstChild?.instanceId ?? null,
    parentLast: parent4.lastChild?.instanceId ?? null,
    headNext: head.nextSibling?.instanceId ?? null,
  };

  resetManager();
  const parent5 = new BackgroundElementTemplateInstance('view');
  const other = new BackgroundElementTemplateInstance('text');
  let removeError: string | null = null;
  try {
    parent5.removeChild(other);
  } catch (error) {
    removeError = error instanceof Error ? error.message : String(error);
  }

  return { removeSingle, removeMiddle, removeFirst, removeLast, removeError };
}
