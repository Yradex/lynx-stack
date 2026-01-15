import { BackgroundElementTemplateInstance } from '../../../../../../src/element-template/background/instance.js';

export function run() {
  const instance = new BackgroundElementTemplateInstance('view');
  instance.attrs = { 0: { id: 'a' } };
  const first = instance.attrs;
  instance.attrs = { 0: { id: 'b' } };
  const second = instance.attrs;

  const instance2 = new BackgroundElementTemplateInstance('view');
  const attrs = {
    0: { id: 'a' },
    1: { class: 'foo' },
  };
  instance2.setAttribute('attrs', attrs);
  const setAttr = {
    keys: Object.keys(instance2.attrs),
    values: instance2.attrs,
  };

  return { assignment: { first, second }, setAttr };
}
