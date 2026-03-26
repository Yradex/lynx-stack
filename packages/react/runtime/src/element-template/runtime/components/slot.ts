// Copyright 2025 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
import type { ComponentChild, ComponentChildren } from 'preact';
import { createElement } from 'preact';

type ElementTemplateSlotMarker = {
  __etSlot: true;
  id: number;
  children: ComponentChildren;
};

/**
 * @internal
 */
export function __etSlot(id: number, children: ComponentChildren): ComponentChild {
  if (__BACKGROUND__) {
    // @ts-expect-error - 'slot' is not a standard JSX element but we support it in our adapter
    return createElement('slot', { id }, children);
  }
  return {
    __etSlot: true,
    id,
    children,
  } as ElementTemplateSlotMarker;
}
