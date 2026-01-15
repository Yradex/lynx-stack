import {
  BackgroundElementTemplateSlot,
  BackgroundElementTemplateText,
} from '../../../../../../src/element-template/background/instance.js';

export function run() {
  const slot = new BackgroundElementTemplateSlot();
  const slotType = { type: slot.type };

  const textNode = new BackgroundElementTemplateText('hello');
  const textType = { type: textNode.type, text: textNode.text };

  const textSet = new BackgroundElementTemplateText('');
  textSet.setAttribute('0', 'world');
  const afterIndex = textSet.text;
  textSet.setAttribute('data', 'demo');
  const afterData = textSet.text;
  const textSetAttr = { afterIndex, afterData };

  const textData = new BackgroundElementTemplateText('');
  textData.data = 'world';
  const textDataProp = { text: textData.text, data: textData.data };

  const textAttrs = new BackgroundElementTemplateText('');
  const attrs = { 0: { color: 'red' } };
  textAttrs.setAttribute('attrs', attrs);
  const delegateAttrs = { attrs: textAttrs.attrs };

  return { slotType, textType, textSetAttr, textDataProp, delegateAttrs };
}
