# Rossi Scaffold

This directory is an experimental staging area for Rossi-backed ET fixtures.

The intent is different from the existing ET fixture harness:

- Rossi should own execution and observation.
- ET tests should continue to own source loading and compilation.
- ET tests may provide runtime assembly information, but should not own
  Rossi lifecycle semantics such as first-screen driving or update consumption.
- Fixture inputs passed into Rossi should be mostly declarative.
- Test-local scripts should shrink to optional escape hatches instead of being
  the default control plane.

This scaffold is intentionally incomplete. It exists to make the handoff shape
concrete while Rossi's compiled-artifact runtime adapters are still landing.
When Rossi root values are present, the local bridge should now exercise them
and surface structured "not implemented yet" diagnostics instead of stopping at
pure capability probing.

## Proposed Layout

- `fixtures/`
  - Declarative sample inputs and expected Rossi outputs.
- `fixtureContract.ts`
  - The minimal compiled-artifact and execution-assembly shape ET should hand
    to Rossi.
- `adaptCompiledFixture.ts`
  - A tiny ET-side adapter that converts local compile results into Rossi input
    or a full Rossi fixture request.
- `createRossiArtifactMaterializer.ts`
  - ET-side adapter from fixture requests into Rossi's `ArtifactMaterializer`
    contract.
- `createRossiEnvironmentInstallers.ts`
  - ET-side adapter from thread assembly hints into Rossi's
    `ThreadEnvironmentInstaller` contracts.
- `createCompiledArtifactAdapterSetup.ts`
  - The ET-side join point that packages a fixture request into Rossi's
    `CompiledArtifactAdapterSetup` shape.
- `compiled-input.contract.test.ts`
  - A real ET-side contract test that runs transform and verifies the compiled
    input shape before any Rossi execution is involved.
- `*.scaffold.test.ts`
  - Skipped test shells that show how future Vitest integration may look
    without affecting the current ET suite.

## Boundary Proposal

The current preferred boundary is:

- ET-side test code compiles `source.tsx`
- ET-side test code adapts that compiled result into a Rossi request object
- That request describes what artifacts exist and what per-thread environment
  setup Rossi needs
- Rossi consumes that declarative bundle and remains responsible for actively
  driving render / update lifecycles

In other words, Rossi should not need to understand:

- ET Vitest plugin wiring
- ET alias resolution
- `@lynx-js/react-transform` invocation details
- local fixture discovery rules inside this test directory

Those concerns should stay in this package and be converted into a smaller
compiled-artifact request before Rossi is called.

## Architecture Safety

This scaffold should not force changes onto Rossi's global architecture.

Concretely:

- do not assume Rossi must compile ET sources
- do not assume Rossi must expose a new root-package ET entrypoint immediately
- do not assume ET tests should implement `renderFirstScreen()` /
  `consumeUpdate()` equivalents
- do not assume ET fixture concerns belong in Rossi core modules

If a bridge is needed, prefer keeping it local to this ET test directory first.
That lets us validate the contract shape before asking Rossi to absorb any new
public or semi-public surface.

## First-pass Fixture Shape

For a minimal render case, the fixture folder should be able to answer:

- what source ET should compile
- what mode should Rossi execute (`render`, `patch`, `interaction`, etc.)
- what thread-level setup hints Rossi needs in order to materialize artifacts
  and install environments
- what stable outputs should be asserted

The first scaffold case uses:

- `source.tsx`
  - the ET source under test
- `expect.tree.txt`
  - normalized tree expectation
- `expect.trace.json`
  - selected trace expectation
- `expect.diagnostics.json`
  - expected diagnostics

The exact schema is deliberately not frozen yet.

## First-pass Compiled Input Contract

The current scaffold assumes ET-side tests can hand Rossi a shape roughly like:

```ts
{
  mode: 'render',
  main: {
    code: string,
    target: 'LEPUS' | 'MIXED',
    elementTemplates: unknown[],
  },
  background?: {
    code: string,
    target: 'JS' | 'MIXED',
    elementTemplates: unknown[],
  },
}
```

This is intentionally narrower than the current ET test helpers. The goal is to
keep Rossi decoupled from ET fixture environment details while still letting ET
tests drive compilation however they need.

## Rossi Contract Join

This scaffold now targets Rossi's substrate contracts directly:

- ET owns the fixture request shape
- ET adapts that request into Rossi `ArtifactMaterializer` and
  `ThreadEnvironmentInstaller` contracts
- Rossi remains responsible for the runtime adapter that will eventually drive
  `renderPage`, collect first-screen payloads, drain updates, and observe
  tree / trace / diagnostics

## Non-goals For This Scaffold

- no full ET first-screen execution yet
- no inclusion in current ET fixture runners
- no promise that these filenames are final
