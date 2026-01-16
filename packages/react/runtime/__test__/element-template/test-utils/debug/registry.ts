// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

export const templateRepo = new Map<string, any>();

export function registerTemplates(templates: any[]): void {
  for (const t of templates) {
    // The key is templateId, value is compiledTemplate
    templateRepo.set(t.templateId, t.compiledTemplate);
  }
}

export function clearTemplates(): void {
  templateRepo.clear();
}
