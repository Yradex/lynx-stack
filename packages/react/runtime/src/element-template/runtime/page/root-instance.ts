// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { BackgroundElementTemplateInstance } from '../../background/instance.js';

/**
 * Element Template-only root for renderPage.
 */
let __root:
  & (
    | {
      __jsx?: React.ReactNode;
      __opcodes?: any[];
      nodeType?: Element['nodeType'];
    }
    | BackgroundElementTemplateInstance
  )
  & {
    __jsx?: React.ReactNode;
    __opcodes?: any[];
  };

function setRoot(root: typeof __root): void {
  __root = root;

  // A fake ELEMENT_NODE to make preact/debug happy.
  if (__DEV__ && __root) {
    __root.nodeType = 1;
  }
}

if (__BACKGROUND__) {
  setRoot(new BackgroundElementTemplateInstance('root'));
} else {
  setRoot({});
}

export { __root, setRoot };
