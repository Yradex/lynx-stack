// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import type { BackgroundElementTemplateInstance } from './instance.js';

export const backgroundElementTemplateInstanceManager: {
  nextId: number;
  values: Map<number, BackgroundElementTemplateInstance>;
  register(instance: BackgroundElementTemplateInstance): void;
  updateId(oldId: number, newId: number): void;
  get(id: number): BackgroundElementTemplateInstance | undefined;
  clear(): void;
} = {
  nextId: 0,
  values: new Map<number, BackgroundElementTemplateInstance>(),

  register(instance: BackgroundElementTemplateInstance): void {
    instance.instanceId = this.nextId += 1;
    this.values.set(instance.instanceId, instance);
  },

  updateId(oldId: number, newId: number): void {
    const instance = this.values.get(oldId);
    if (instance) {
      this.values.delete(oldId);
      instance.instanceId = newId;
      this.values.set(newId, instance);

      // DevTools event emission can be added here later
      // if (__DEV__) { ... }
    }
  },

  get(id: number): BackgroundElementTemplateInstance | undefined {
    return this.values.get(id);
  },

  clear(): void {
    // Note: nextId is NOT reset to prevent ID collisions with potentially surviving instances
    // or when the clear is partial/soft reset in some scenarios (aligned with snapshot logic).
    this.values.clear();
  },
};
