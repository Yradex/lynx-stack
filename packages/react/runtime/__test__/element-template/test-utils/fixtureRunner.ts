import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { expect, it } from 'vitest';

const UPDATE_VALUES = new Set(['1', 'true', 'yes', 'on']);

export interface FixtureContext {
  fixtureName: string;
  fixtureDir: string;
  update: boolean;
  tempDir: string;
}

export interface RunFixtureOptions {
  fixturesRoot: string;
  run: (context: FixtureContext) => Promise<void> | void;
  filter?: string[];
  allowEmpty?: boolean;
}

export function isUpdateMode(): boolean {
  const raw = process.env['UPDATE']?.toLowerCase();
  return raw ? UPDATE_VALUES.has(raw) : false;
}

export function runFixtureTests({
  fixturesRoot,
  run,
  filter,
  allowEmpty = false,
}: RunFixtureOptions): void {
  if (!fs.existsSync(fixturesRoot)) {
    if (allowEmpty) {
      it.todo('fixtures pending');
      return;
    }
    throw new Error(`Fixtures root not found: ${fixturesRoot}`);
  }

  const fixtures = listFixtureDirs(fixturesRoot);
  const requested = filter ?? parseFixtureFilter();
  const targets = requested.length > 0 ? requested : fixtures;

  if (targets.length === 0) {
    if (allowEmpty) {
      it.todo('fixtures pending');
      return;
    }
    throw new Error('No fixtures found to run.');
  }

  const unknown = targets.filter(name => !fixtures.includes(name));
  if (unknown.length > 0) {
    throw new Error(`Unknown fixtures: ${unknown.join(', ')}`);
  }

  for (const fixtureName of targets) {
    it(`fixture: ${fixtureName}`, async () => {
      const fixtureDir = path.join(fixturesRoot, fixtureName);
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lynx-fixture-'));
      try {
        await run({
          fixtureName,
          fixtureDir,
          update: isUpdateMode(),
          tempDir,
        });
      } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });
  }
}

export function assertOrUpdateTextFile(options: {
  path: string;
  actual: string;
  update: boolean;
  fixtureName: string;
  label: string;
}): void {
  const { path: filePath, actual, update, fixtureName, label } = options;

  if (update) {
    fs.writeFileSync(filePath, actual);
    return;
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label} for fixture "${fixtureName}". Run with UPDATE=1.`);
  }

  const expected = fs.readFileSync(filePath, 'utf8');
  expect(actual).toBe(expected);
}

export function assertMissingFile(options: {
  path: string;
  update: boolean;
  fixtureName: string;
  label: string;
}): void {
  const { path: filePath, update, fixtureName, label } = options;

  if (update) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return;
  }

  if (fs.existsSync(filePath)) {
    throw new Error(`Unexpected ${label} for fixture "${fixtureName}". Run with UPDATE=1.`);
  }
}

export function expectReportErrorCount(expectedCount: number): void {
  const globalErrors = (globalThis as unknown as { __LYNX_REPORT_ERROR_CALLS?: unknown[] })
    .__LYNX_REPORT_ERROR_CALLS ?? [];
  const reportError = (globalThis as unknown as { lynx?: { reportError?: { mock?: { calls: unknown[][] } } } })
    .lynx?.reportError;
  const mockCalls = reportError?.mock?.calls ?? [];

  if (expectedCount === 0) {
    expect(mockCalls.length).toBe(0);
    expect(globalErrors.length).toBe(0);
    return;
  }

  const candidates = [] as number[];
  if (mockCalls.length > 0) candidates.push(mockCalls.length);
  if (globalErrors.length > 0) candidates.push(globalErrors.length);
  const actual = candidates.length > 0 ? Math.max(...candidates) : 0;

  expect(actual).toBe(expectedCount);
}

function listFixtureDirs(fixturesRoot: string): string[] {
  if (!fs.existsSync(fixturesRoot)) {
    throw new Error(`Fixtures root not found: ${fixturesRoot}`);
  }

  return fs
    .readdirSync(fixturesRoot)
    .filter(entry => fs.statSync(path.join(fixturesRoot, entry)).isDirectory())
    .sort();
}

function parseFixtureFilter(): string[] {
  const raw = process.env['FIXTURE'];
  if (!raw) return [];
  return raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}
