# Element Template Tests

This directory contains the dedicated test suite for `src/element-template/**`.

## Layout

- `runtime/`: tests mapped to runtime implementation areas under `src/element-template/runtime/`.
- `runtime/background/`: tests for background-side document, instance, commit, and render behavior.
- `native/`: tests for native entrypoints and thread bridge setup.
- `debug/`: tests for Element Template specific debug and profiling hooks.
- `lynx/`: tests for Lynx-facing timing and performance integration.
- `internal/`: tests for internal compatibility or guard behavior.
- `imports/`: guardrail tests that enforce import boundaries or entrypoint constraints.
- `fixtures/`: fixture data used by integration-style suites.
- `test-utils/`: mocks, serializers, fixture runners, and shared ET-only helpers.

## Placement Rules

- If a test targets one source module or one small group of closely related modules, place it under the matching source-domain directory.
- If a test validates a render, hydrate, patch, or background flow across multiple modules, prefer a fixture-based suite.
- Put import-boundary and architecture guardrail tests in `imports/` instead of the root.
- Avoid adding new root-level test files unless the test truly spans multiple top-level ET domains.

## Fixture Conventions

- Fixture directories live under `fixtures/` and should mirror the owning test domain, for example `fixtures/patch/` or `fixtures/background/render/`.
- A fixture case is discovered when a directory contains `case.ts`, `case.tsx`, or `index.tsx`.
- Most case-driven suites should use `runCaseModuleFixtureTests(...)` from [test-utils/debug/fixtureRunner.ts](/Users/bytedance/lynx/workspace.worktrees/element-template-demo/rspeedy/lynx-stack/packages/react/runtime/__test__/element-template/test-utils/debug/fixtureRunner.ts).
- Keep `runtime/render/fixtures.test.ts` separate unless the suite needs the same compile-and-register-template flow.

## Commands

Run the ET suite from `packages/react/runtime/`:

```bash
pnpm test:et
```

When debugging config-loader issues locally, this fallback runs the same suite without changing test semantics:

```bash
pnpm exec vitest run --configLoader runner -c __test__/element-template/vitest.config.ts
```
