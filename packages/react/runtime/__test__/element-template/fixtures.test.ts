// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installMockNativePapi, registerTemplates, serializeToJSX } from './utils/mockNativePapi.js';
import { renderOpcodesIntoElementTemplate } from '../../src/element-template/runtime/render/renderOpcodes.js';
import { resetTemplateId } from '../../src/element-template/runtime/template/handle.js';
import { ElementTemplateRegistry } from '../../src/element-template/runtime/template/registry.js';
import { renderToString } from '../../src/renderToOpcodes/index.js';

declare global {
  var __USE_ELEMENT_TEMPLATE__: boolean | undefined;
}

interface RootNode {
  type: 'page';
  id: string;
  children: unknown[];
}

interface TransformResult {
  code?: string;
  elementTemplates?: unknown[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, './fixtures');

const isUpdate = process.env['UPDATE'] === '1' || process.env['UPDATE'] === 'true';

describe('Fixture Integration Tests', () => {
  let root: RootNode;
  let nativeLog: unknown[];
  let cleanup: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    ElementTemplateRegistry.clear();
    resetTemplateId();
    globalThis.__USE_ELEMENT_TEMPLATE__ = true;

    const installed = installMockNativePapi();
    nativeLog = installed.nativeLog as unknown[];
    cleanup = installed.cleanup;
    root = { type: 'page', id: '0', children: [] };
  });

  afterEach(() => {
    cleanup();
    globalThis.__USE_ELEMENT_TEMPLATE__ = undefined;
  });

  const fixtures = fs.readdirSync(FIXTURES_DIR).filter(f => fs.statSync(path.join(FIXTURES_DIR, f)).isDirectory());

  fixtures.forEach(fixtureName => {
    it(`fixture: ${fixtureName}`, async () => {
      const fixtureDir = path.join(FIXTURES_DIR, fixtureName);
      const sourcePath = path.join(fixtureDir, 'index.tsx');
      const compiledJsPath = path.join(fixtureDir, 'index.js.txt');
      const templatesPath = path.join(fixtureDir, 'templates.json.txt');
      const expectedPath = path.join(fixtureDir, 'output.txt');
      const papiPath = path.join(fixtureDir, 'papi.txt');
      const tempImportPath = path.join(fixtureDir, 'temp_actual.js');

      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Source file missing for fixture "${fixtureName}"`);
      }

      // 1. Compile source code
      const code = fs.readFileSync(sourcePath, 'utf8');
      const { transformReactLynx } = await import('@lynx-js/react-transform');
      const transformOptions = {
        mode: 'test',
        pluginName: 'test-plugin',
        filename: 'index.tsx',
        sourcemap: false,
        cssScope: false,
        snapshot: {
          preserveJsx: false,
          runtimePkg: '@lynx-js/react/element-template/internal',
          filename: 'index.tsx',
          target: 'LEPUS',
          experimentalEnableElementTemplate: true,
        },
        shake: false,
        compat: true,
        directiveDCE: false,
        defineDCE: false,
        worklet: false,
        refresh: false,
      } as Parameters<typeof transformReactLynx>[1];
      const result = (await transformReactLynx(code, transformOptions)) as TransformResult;

      let outputCode = result.code ?? '';
      outputCode = outputCode.replace(/from ["']react\/jsx-runtime["']/g, 'from "@lynx-js/react/jsx-runtime"');

      const outputTemplates = result.elementTemplates ? JSON.stringify(result.elementTemplates, null, 2) : '';

      // 2. Verify or Bless Compilation Artifacts
      if (isUpdate) {
        fs.writeFileSync(compiledJsPath, outputCode);
        if (outputTemplates) {
          fs.writeFileSync(templatesPath, outputTemplates);
        } else if (fs.existsSync(templatesPath)) {
          fs.unlinkSync(templatesPath);
        }
      } else {
        if (!fs.existsSync(compiledJsPath)) {
          throw new Error(`Compiled file missing for fixture "${fixtureName}". Run with UPDATE=1.`);
        }
        const expectedCode = fs.readFileSync(compiledJsPath, 'utf8');
        expect(outputCode).toBe(expectedCode);

        if (outputTemplates) {
          if (!fs.existsSync(templatesPath)) {
            throw new Error(`Templates file missing for fixture "${fixtureName}". Run with UPDATE=1.`);
          }
          const expectedTemplates = fs.readFileSync(templatesPath, 'utf8');
          expect(outputTemplates).toBe(expectedTemplates);
        } else {
          expect(fs.existsSync(templatesPath)).toBe(false);
        }
      }

      // 3. Register templates
      if (isUpdate && outputTemplates) {
        registerTemplates(JSON.parse(outputTemplates) as any[]);
      } else if (fs.existsSync(templatesPath)) {
        const templates = JSON.parse(fs.readFileSync(templatesPath, 'utf8')) as any[];
        registerTemplates(templates);
      }

      // 4. Load the component
      // To import the compiled code, we must write it to a .js file temporarily.
      fs.writeFileSync(tempImportPath, outputCode);
      try {
        const module = (await import(`${tempImportPath}?t=${Date.now()}`)) as { App: unknown };
        const App = module.App;

        // 5. Render
        const vnode = { type: App, props: {}, key: null, ref: null };
        const opcodes = renderToString(vnode, null);
        renderOpcodesIntoElementTemplate(opcodes, root);

        const actualJSX = serializeToJSX(root.children[0]);
        const actualPapi = JSON.stringify(nativeLog, null, 2);

        // 6. Verify or Bless Output Snapshot
        if (isUpdate) {
          fs.writeFileSync(expectedPath, actualJSX);
          fs.writeFileSync(papiPath, actualPapi);
        } else {
          if (!fs.existsSync(expectedPath)) {
            throw new Error(
              `Expected file missing for fixture "${fixtureName}". Run with UPDATE=1 to generate it.`,
            );
          }
          const expectedJSX = fs.readFileSync(expectedPath, 'utf8');
          expect(actualJSX).toBe(expectedJSX);

          if (!fs.existsSync(papiPath)) {
            throw new Error(
              `PAPI log missing for fixture "${fixtureName}". Run with UPDATE=1 to generate it.`,
            );
          }
          const expectedPapi = fs.readFileSync(papiPath, 'utf8');
          expect(actualPapi).toBe(expectedPapi);
        }
      } finally {
        if (fs.existsSync(tempImportPath)) {
          fs.unlinkSync(tempImportPath);
        }
      }
    });
  });
});
