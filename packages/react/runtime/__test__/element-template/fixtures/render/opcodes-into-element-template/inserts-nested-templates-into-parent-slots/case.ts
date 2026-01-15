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
      { type: '_et_outer', props: {} },
      __OpSlot,
      0,
      __OpBegin,
      { type: '_et_inner', props: {} },
      __OpAttr,
      'attrs',
      { 0: { id: 'inner' } },
      __OpSlot,
      0,
      __OpText,
      'X',
      __OpEnd,
      __OpEnd,
    ];

    renderOpcodesIntoElementTemplate(opcodes, root);

    return {
      output: {
        rootChild: root.children?.[0],
        registryHas: {
          '-1': ElementTemplateRegistry.has(-1),
          '-2': ElementTemplateRegistry.has(-2),
        },
      },
      files: {
        'native-log.txt': nativeLog,
      },
    };
  });
}
