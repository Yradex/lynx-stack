// Copyright 2024 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, vi } from 'vitest';

import { resetElementTemplateHydrationListener } from '../../../../src/element-template/background/hydration-listener.js';
import { renderOpcodesIntoElementTemplate } from '../../../../src/element-template/runtime/render/render-opcodes.js';
import { resetTemplateId } from '../../../../src/element-template/runtime/template/handle.js';
import { ElementTemplateRegistry } from '../../../../src/element-template/runtime/template/registry.js';
import { removeCtxNotFoundEventListener } from '../../../../src/lifecycle/patch/error.js';
import { renderToString } from '../../../../src/renderToOpcodes/index.js';
import { installMockNativePapi } from '../../test-utils/mockNativePapi.js';
import { registerTemplates } from '../../test-utils/registry.js';
import { serializeToJSX } from '../../test-utils/serializer.js';
import {
  assertMissingFile,
  assertOrUpdateTextFile,
  formatFixtureOutput,
  expectReportErrorCount,
  runFixtureTests,
} from '../../test-utils/fixtureRunner.js';

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
const FIXTURES_DIR = path.resolve(__dirname, '../../fixtures/render');

describe('Fixture Integration Tests', () => {
  runFixtureTests({
    fixturesRoot: FIXTURES_DIR,
    async run({ fixtureDir, fixtureName, update, tempDir }) {
      const casePath = fs.existsSync(path.join(fixtureDir, 'case.ts'))
        ? path.join(fixtureDir, 'case.ts')
        : path.join(fixtureDir, 'case.tsx');
      const sourcePath = path.join(fixtureDir, 'index.tsx');
      const compiledJsPath = path.join(fixtureDir, 'index.js.txt');
      const templatesPath = path.join(fixtureDir, 'templates.json.txt');
      const expectedPath = path.join(fixtureDir, 'output.txt');
      const papiPath = path.join(fixtureDir, 'papi.txt');
      const tempImportPath = path.join(tempDir, 'temp_actual.js');

      if (fs.existsSync(casePath)) {
        const relativePath = path.relative(__dirname, casePath);
        const modulePath = (relativePath.startsWith('.') ? relativePath : `./${relativePath}`)
          .split(path.sep)
          .join('/');
        const caseModule = (await import(modulePath)) as {
          run: (context: { fixtureDir: string; fixtureName: string }) => Promise<unknown> | unknown;
          reportErrorCount?: number;
        };
        const reportErrorCount = caseModule.reportErrorCount ?? 0;
        const result = await caseModule.run({ fixtureDir, fixtureName });
        let output = result;
        let files: Record<string, unknown> | undefined;
        if (result && typeof result === 'object' && !Array.isArray(result)) {
          const candidate = result as { output?: unknown; files?: Record<string, unknown> };
          if ('output' in candidate || 'files' in candidate) {
            output = candidate.output;
            files = candidate.files;
          }
        }

        expectReportErrorCount(reportErrorCount);
        if (files) {
          for (const [fileName, value] of Object.entries(files)) {
            assertOrUpdateTextFile({
              path: path.join(fixtureDir, fileName),
              actual: formatFixtureOutput(value),
              update,
              fixtureName,
              label: fileName,
            });
          }
        }
        const hasOutputFile = files ? Object.prototype.hasOwnProperty.call(files, 'output.txt') : false;
        if (output !== undefined && !hasOutputFile) {
          const outputPath = path.join(fixtureDir, 'output.txt');
          assertOrUpdateTextFile({
            path: outputPath,
            actual: formatFixtureOutput(output),
            update,
            fixtureName,
            label: 'output',
          });
        }
        return;
      }

      if (!fs.existsSync(sourcePath)) {
        throw new Error(`Source file missing for fixture "${fixtureName}"`);
      }

      vi.resetAllMocks();
      ElementTemplateRegistry.clear();
      resetTemplateId();
      globalThis.__USE_ELEMENT_TEMPLATE__ = true;

      const installed = installMockNativePapi();
      const nativeLog = installed.nativeLog as unknown[];
      const cleanup = installed.cleanup;
      const root: RootNode = { type: 'page', id: '0', children: [] };

      try {
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
        assertOrUpdateTextFile({
          path: compiledJsPath,
          actual: outputCode,
          update,
          fixtureName,
          label: 'compiled js',
        });

        if (outputTemplates) {
          assertOrUpdateTextFile({
            path: templatesPath,
            actual: outputTemplates,
            update,
            fixtureName,
            label: 'templates',
          });
        } else {
          assertMissingFile({
            path: templatesPath,
            update,
            fixtureName,
            label: 'templates',
          });
        }

        // 3. Register templates
        if (update && outputTemplates) {
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
          assertOrUpdateTextFile({
            path: expectedPath,
            actual: actualJSX,
            update,
            fixtureName,
            label: 'jsx output',
          });
          assertOrUpdateTextFile({
            path: papiPath,
            actual: actualPapi,
            update,
            fixtureName,
            label: 'papi log',
          });
        } finally {
          if (fs.existsSync(tempImportPath)) {
            fs.unlinkSync(tempImportPath);
          }
        }
        expectReportErrorCount(0);
      } finally {
        resetElementTemplateHydrationListener();
        // TODO: ???
        removeCtxNotFoundEventListener();
        cleanup();
        globalThis.__USE_ELEMENT_TEMPLATE__ = undefined;
      }
    },
  });
});
