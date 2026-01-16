import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformReactLynx } from '@lynx-js/react-transform';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, '../../fixtures');

async function generate(fixtureName: string) {
  const fixtureDir = path.join(FIXTURES_DIR, fixtureName);
  const sourcePath = path.join(fixtureDir, 'index.tsx');

  if (!fs.existsSync(sourcePath)) {
    console.error(`Source not found: ${sourcePath}`);
    return;
  }

  const code = fs.readFileSync(sourcePath, 'utf8');

  const result = await transformReactLynx(code, {
    mode: 'test',
    pluginName: 'test-plugin',
    filename: 'index.tsx',
    sourcemap: false,
    cssScope: false,
    jsx: {
      runtimePkg: '@lynx-js/react-runtime',
      filename: 'index.tsx',
      target: 'LEPUS',
    },
    snapshot: {
      preserveJsx: false,
      runtimePkg: '@lynx-js/react',
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
  } as any);

  let outputCode = result.code || '';
  outputCode = outputCode.replace(/from ["']react\/jsx-runtime["']/g, 'from "@lynx-js/react/jsx-runtime"');
  // Specifically target Slot import to avoid corrupting Component import
  outputCode = outputCode.replace(
    /\{ Slot as Slot \} from ["']@lynx-js\/react["']/g,
    '{ Slot as Slot } from "@lynx-js/react/internal"',
  );

  fs.writeFileSync(path.join(fixtureDir, 'index.js.txt'), outputCode);

  if (result.elementTemplates) {
    fs.writeFileSync(
      path.join(fixtureDir, 'templates.json.txt'),
      JSON.stringify(result.elementTemplates, null, 2),
    );
  }

  console.log(`Generated fixture: ${fixtureName}`);
}

const args = process.argv.slice(2);
if (args.length > 0 && args[0]) {
  generate(args[0]).catch(console.error);
} else {
  console.log('Usage: node generateFixtures.js [fixtureName]');
}
