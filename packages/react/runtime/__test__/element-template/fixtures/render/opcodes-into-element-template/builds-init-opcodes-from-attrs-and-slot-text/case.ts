import {
  ElementTemplateRegistry,
  __OpAttr,
  __OpBegin,
  __OpEnd,
  __OpSlot,
  __OpText,
  renderOpcodesIntoElementTemplate,
  runCase,
} from '../_shared.js';

export function run() {
  return runCase(({ root, nativeLog }) => {
    const opcodes = [
      __OpBegin,
      { type: '_et_foo', props: {} },
      __OpAttr,
      'attrs',
      { 0: { id: 'test' } },
      __OpSlot,
      1,
      __OpText,
      'Hello',
      __OpEnd,
    ];

    renderOpcodesIntoElementTemplate(opcodes, root);

    const registryNode = ElementTemplateRegistry.get(-2);
    const rootChild = root.children?.[0];

    return {
      output: {
        registryNode,
        rootChild,
        rootChildMatchesRegistry: rootChild === registryNode,
      },
      files: {
        'native-log.txt': nativeLog,
      },
    };
  });
}
