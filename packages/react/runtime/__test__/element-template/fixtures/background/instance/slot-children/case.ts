import {
  BackgroundElementTemplateInstance,
  BackgroundElementTemplateSlot,
  BackgroundElementTemplateText,
} from '../../../../../../src/element-template/background/instance.js';

function describeNode(node: BackgroundElementTemplateInstance): { id: number; type: string; text?: string } {
  const base = { id: node.instanceId, type: node.type } as { id: number; type: string; text?: string };
  if (node.type === 'raw-text') {
    base.text = (node as BackgroundElementTemplateText).text;
  }
  return base;
}

export function run() {
  const slot = new BackgroundElementTemplateSlot();
  slot.setAttribute('id', 10);
  const partId = slot.partId;

  const root = new BackgroundElementTemplateInstance('element-template-view');
  const slot1 = new BackgroundElementTemplateSlot();
  slot1.setAttribute('id', 0);
  const text1 = new BackgroundElementTemplateText('Hello');
  slot1.appendChild(text1);

  const slot2 = new BackgroundElementTemplateSlot();
  slot2.setAttribute('id', 1);
  const text2 = new BackgroundElementTemplateText('World');
  const view2 = new BackgroundElementTemplateInstance('view');
  slot2.appendChild(text2);
  slot2.appendChild(view2);

  root.appendChild(slot1);
  root.appendChild(slot2);

  const slotChildren = root.slotChildren;
  const aggregated = {
    size: slotChildren.size,
    items: Object.fromEntries(
      [...slotChildren.entries()].map(([key, values]) => [
        key,
        values.map((node) => describeNode(node as BackgroundElementTemplateInstance)),
      ]),
    ),
  };

  const root2 = new BackgroundElementTemplateInstance('element-template-view');
  const view = new BackgroundElementTemplateInstance('view');
  root2.appendChild(view);
  const ignoreNonSlot = { size: root2.slotChildren.size };

  const root3 = new BackgroundElementTemplateInstance('element-template-view');
  const slotDefault = new BackgroundElementTemplateSlot();
  slotDefault.appendChild(new BackgroundElementTemplateText('Hello'));
  root3.appendChild(slotDefault);
  const ignoreDefaultPart = { size: root3.slotChildren.size };

  return { partId, aggregated, ignoreNonSlot, ignoreDefaultPart };
}
