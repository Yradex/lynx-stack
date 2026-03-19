// Copyright 2025 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { deleteElementTemplateNativeRef, setElementTemplateNativeRef } from './registry.js';

// Main-thread IFR allocates ids as consecutive negative integers.
let nextId = -1;

export interface ElementTemplateHandleMetadata {
  templateId: string;
  handleId: number;
  attributeSlots: SerializableValue[] | null;
  options: RuntimeOptions;
}

const elementTemplateMetadataStore = new WeakMap<object, ElementTemplateHandleMetadata>();

export function reserveElementTemplateId(): number {
  const id = nextId--;
  return id;
}

export function createElementTemplateWithHandle(
  templateKey: string,
  bundleUrl: string | null | undefined,
  attributeSlots: SerializableValue[] | null | undefined,
  elementSlots: ElementRef[][] | null | undefined,
  options?: RuntimeOptions,
): ElementRef {
  const handleId = nextId--;
  const runtimeOptions = normalizeRuntimeOptions({
    ...options,
    handleId,
  });
  const nativeRef = __CreateElementTemplate(
    templateKey,
    bundleUrl,
    attributeSlots,
    elementSlots,
    runtimeOptions,
  );
  annotateTemplateHandle(nativeRef, templateKey, handleId, attributeSlots, runtimeOptions);
  setElementTemplateNativeRef(handleId, nativeRef);
  return nativeRef;
}

export function resetTemplateId(): void {
  nextId = -1;
}

export function destroyElementTemplateId(id: number): void {
  deleteElementTemplateNativeRef(id);
  // __ReleaseElement(nativeRef);
}

export function getElementTemplateHandleMetadata(
  nativeRef: ElementRef,
): ElementTemplateHandleMetadata | undefined {
  if (typeof nativeRef !== 'object' || nativeRef === null) {
    return undefined;
  }

  return elementTemplateMetadataStore.get(nativeRef);
}

export function setElementTemplateHandleMetadata(
  nativeRef: ElementRef,
  metadata: ElementTemplateHandleMetadata,
): void {
  if (typeof nativeRef !== 'object' || nativeRef === null) {
    return;
  }

  elementTemplateMetadataStore.set(nativeRef, metadata);
}

function normalizeRuntimeOptions(
  options: RuntimeOptions,
): RuntimeOptions {
  const normalizedEntries = Object.entries(options)
    .filter(([, value]) => value !== undefined);
  return Object.fromEntries(normalizedEntries) as RuntimeOptions;
}

function annotateTemplateHandle(
  nativeRef: ElementRef,
  templateKey: string,
  handleId: number,
  attributeSlots: SerializableValue[] | null | undefined,
  options: RuntimeOptions,
): void {
  if (typeof nativeRef !== 'object' || nativeRef === null) {
    return;
  }

  const metadata: ElementTemplateHandleMetadata = {
    templateId: templateKey,
    handleId,
    attributeSlots: attributeSlots ?? null,
    options,
  };
  setElementTemplateHandleMetadata(nativeRef, metadata);

  // Native refs may be host objects that do not reliably preserve arbitrary JS properties.
  // Keep the legacy annotations as a best-effort path for mocks/tests only.
  try {
    Object.defineProperties(nativeRef, {
      templateId: {
        configurable: true,
        enumerable: true,
        value: templateKey,
        writable: true,
      },
      __handleId: {
        configurable: true,
        enumerable: false,
        value: handleId,
        writable: true,
      },
      __attributeSlots: {
        configurable: true,
        enumerable: false,
        value: attributeSlots ?? null,
        writable: true,
      },
      __options: {
        configurable: true,
        enumerable: false,
        value: options,
        writable: true,
      },
    });
  } catch {
    // Ignore host object annotation failures; sidecar metadata is the source of truth.
  }
}
