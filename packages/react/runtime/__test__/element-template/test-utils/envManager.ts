// Copyright 2025 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { BackgroundElementTemplateInstance } from '../../../src/element-template/background/instance.js';
import { backgroundElementTemplateInstanceManager } from '../../../src/element-template/background/manager.js';
import { setupBackgroundElementTemplateDocument } from '../../../src/element-template/background/document.js';
import { __root, setRoot } from '../../../src/element-template/runtime/page/root-instance.js';
import { resetTemplateId } from '../../../src/element-template/runtime/template/handle.js';
import { ElementTemplateRegistry } from '../../../src/element-template/runtime/template/registry.js';

type RootRef = typeof __root;

export class ElementTemplateEnvManager {
  private mainRoot: RootRef | undefined;
  private backgroundRoot: BackgroundElementTemplateInstance | undefined;

  constructor(private target: typeof globalThis = globalThis) {}

  switchToMainThread(): void {
    if (this.target.__BACKGROUND__) {
      this.backgroundRoot = __root as BackgroundElementTemplateInstance;
    }

    if (!this.mainRoot) {
      this.mainRoot = {};
    }

    if (this.backgroundRoot && '__jsx' in this.backgroundRoot) {
      this.mainRoot.__jsx = this.backgroundRoot.__jsx;
      this.mainRoot.__opcodes = this.backgroundRoot.__opcodes;
    }

    setRoot(this.mainRoot);
    this.target.__LEPUS__ = true;
    this.target.__JS__ = false;
    this.target.__MAIN_THREAD__ = true;
    this.target.__BACKGROUND__ = false;
  }

  switchToBackground(): void {
    if (this.target.__MAIN_THREAD__) {
      this.mainRoot = __root;
    }

    if (!(this.backgroundRoot instanceof BackgroundElementTemplateInstance)) {
      this.backgroundRoot = new BackgroundElementTemplateInstance('root');
    }

    if (this.mainRoot && '__jsx' in this.mainRoot) {
      this.backgroundRoot.__jsx = this.mainRoot.__jsx;
      this.backgroundRoot.__opcodes = this.mainRoot.__opcodes;
    }

    setRoot(this.backgroundRoot);
    this.target.__LEPUS__ = false;
    this.target.__JS__ = true;
    this.target.__MAIN_THREAD__ = false;
    this.target.__BACKGROUND__ = true;
    setupBackgroundElementTemplateDocument();
  }

  resetEnv(initial: 'background' | 'main' = 'background'): void {
    this.mainRoot = undefined;
    this.backgroundRoot = undefined;
    // @ts-expect-error - allow reset to undefined during tests
    setRoot(undefined);

    backgroundElementTemplateInstanceManager.clear();
    backgroundElementTemplateInstanceManager.nextId = 0;
    ElementTemplateRegistry.clear();
    resetTemplateId();

    if (initial === 'background') {
      this.switchToBackground();
    } else {
      this.switchToMainThread();
    }
  }

  setUseElementTemplate(enabled: boolean): void {
    this.target.__USE_ELEMENT_TEMPLATE__ = enabled;
  }
}

export const globalElementTemplateEnvManager = new ElementTemplateEnvManager();
