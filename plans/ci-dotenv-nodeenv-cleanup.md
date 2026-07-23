# Plan: CI workflow, dotenv support, NODE_ENV flag, repo cleanup

## Context

`envoke` (`@takken/envoke`) is a small published npm CLI that runs TypeScript
scripts via `tsx`, resolving tsconfig path mappings (e.g. `@scripts/foo`), with
monorepo awareness (`getRootPath` walks up to the `.git` folder).

Current state (verified 2026-07-23):

- Working tree clean, `main` up to date with origin, tests green, typecheck clean.
- `src/index.ts` — bin entry; spawns `tsx` running `dist/execute.js`.
- `src/execute.ts` — resolves the script (direct path first, then tsconfig
  `paths` mapping from `tsc --showConfig`), spawns it via `tsx`, propagates the
  exit code. Parses `--verbose`/`-v` anywhere in argv and filters it out.
- `src/getRootPath.ts` — recursive `.git`-based repo-root lookup.
- `test/exit-codes.test.mjs` — plain-node test harness (no test framework),
  spawns the BUILT cli (`dist/index.js`) against fixtures in
  `test/fixtures/direct` (relative path) and `test/fixtures/mapped`
  (tsconfig path mapping). `pretest` runs `pnpm build`.
- Package manager: pnpm 10.12.4 via `packageManager` + corepack;
  `pnpm-lock.yaml` is the live lockfile. Stale `yarn.lock` and `.yarnrc.yml`
  are leftovers from a yarn→pnpm migration.
- `package.json` version `0.1.6`; latest git tag is `v0.1.5`.
- No `.github/` directory — no CI at all.
- README `## Todo` lists: dotenv `.env` loading, and a NODE_ENV flag.

## Goals (in order)

- A. GitHub Actions CI running typecheck + build + tests on PRs and main.
- B. `.env` file loading via `dotenv` before running the wrapped script.
- C. Flags to set `NODE_ENV` (`--production` / `--development`) for the child.
- D. Cleanup: remove stale yarn artefacts; reconcile version/tag/npm state.

## Ground rules for the implementer

- Work on branch `feat/ci-env-cleanup` (created from up-to-date `main`).
- TDD per task: red → green → commit → refactor → commit. Never weaken a test.
- Before EVERY commit: `pnpm typecheck && pnpm build && pnpm test` must pass.
- Commit after each completed task; tick its checkbox in this plan in the same
  commit. One task at a time — read, do, tick, commit, move on.
- Commit message first lines ≤ 52 chars. No co-authoring. Never amend.
- Do NOT push, create a PR, tag, or publish without explicit operator
  permission — ask when you reach Phase 5.
- Keep the code style of the existing files (no test framework, plain node
  asserts, small pure helpers, minimal comments).
- Never print environment variable VALUES in logs (secrets). Log file paths
  and variable NAMES only, and only under `--verbose`.

## Settled design decisions (do not re-litigate; escalate only if blocked)

1. **Flag parsing**: envoke flags (`--verbose`/`-v`, `--production`,
   `--development`) are recognised anywhere in argv, matching the existing
   `--verbose` behaviour and README examples. Additionally support a `--`
   separator: everything after a literal `--` is passed to the wrapped script
   verbatim, never interpreted as an envoke flag.
2. **NODE_ENV flags**: `--production` sets `NODE_ENV=production`,
   `--development` sets `NODE_ENV=development` — for the child process env and
   for selecting mode-specific `.env` files. Passing both is an error (exit 1
   with a clear message). If `NODE_ENV` is already set in the calling
   environment AND a flag is given, the flag wins (explicit beats ambient);
   emit a `--verbose` debug line when overriding.
3. **.env loading** (dependency: `dotenv`, as the README Todo prescribes):
   - Files are looked up in TWO directories: the repo root (`getRootPath()`)
     and the current working directory. In a non-monorepo these are the same
     directory — deduplicate so files are not applied twice.
   - Load order within each directory (later loads only fill gaps —
     see precedence): `.env`, `.env.local`, `.env.[NODE_ENV]`,
     `.env.[NODE_ENV].local` (mode files only when NODE_ENV is known, from
     the ambient env or a flag).
   - **Precedence (highest wins): real environment > flag-set NODE_ENV >
     cwd `.env*` files > root `.env*` files; and within a directory
     `.env.[mode].local` > `.env.[mode]` > `.env.local` > `.env`.**
     Existing `process.env` variables are NEVER overwritten by `.env` files
     (dotenv default behaviour — preserve it).
   - Implementation approach: build a child env object rather than mutating
     global state blindly, e.g. parse each file with `dotenv.parse`
     (or `dotenv.config({ processEnv: target })`) into an accumulator applied
     in precedence order, then spawn children with that env. Both spawn sites
     in `execute.ts` (direct branch and mapped branch) must receive it.
   - Missing `.env` files are NOT an error — silently skipped
     (`--verbose` logs which files were found and loaded, paths only).
4. **Where the logic lives**: in `execute.ts` (or small new modules in `src/`
   imported by it, e.g. `src/parseArgs.ts`, `src/loadEnvFiles.ts` — prefer
   small focused modules with unit-testable pure functions). `index.ts` stays
   a thin spawner.
5. **CI**: single workflow `.github/workflows/ci.yml`, inline steps only (no
   composite actions, no `actions/github-script`). Triggers: `pull_request`
   and `push` to `main`. Use corepack so the pinned pnpm from `packageManager`
   is used. Node matrix: 18.x, 20.x, 22.x (engines say `>=18`).
6. **Versioning**: features B + C are additive → bump minor to `0.2.0` in
   Phase 5 (subject to the npm-state check in D2).

## Phase 0 — setup

- [x] 0.1 `git fetch`, confirm `main` is up to date, create branch
      `feat/ci-env-cleanup` from `main`.
- [x] 0.2 Commit this plan file (`plans/ci-dotenv-nodeenv-cleanup.md`) as the
      first commit on the branch.
- [x] 0.3 Run `pnpm install`, `pnpm typecheck`, `pnpm build`, `pnpm test` to
      confirm a green baseline before touching anything.

## Phase 1 — Task A: CI workflow

- [x] 1.1 Create `.github/workflows/ci.yml`:
      - `name: CI`
      - `on: { pull_request: {}, push: { branches: [main] } }`
      - `concurrency: { group: ci-${{ github.ref }}, cancel-in-progress: true }`
      - Job `test`, `runs-on: ubuntu-latest`,
        `strategy.matrix.node: ['18.x', '20.x', '22.x']`.
      - Steps (inline only): `actions/checkout@v4` →
        `corepack enable` → `actions/setup-node@v4` with
        `node-version: ${{ matrix.node }}` and `cache: pnpm` →
        `pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm test`
        (`pretest` already runs the build, so build is covered).
      - Note: `corepack enable` must run BEFORE `setup-node` with
        `cache: pnpm`, otherwise setup-node cannot find pnpm for cache
        resolution.
- [x] 1.2 Validate the workflow locally: run the exact step commands
      (`pnpm install --frozen-lockfile && pnpm typecheck && pnpm test`) from a
      clean state; if `act` is available, run `act pull_request` to smoke-test
      the workflow file. Fix anything it surfaces.
- [x] 1.3 Commit (e.g. `ci: add typecheck and test workflow`). Tick 1.x boxes.

## Phase 2 — Task C first: flag parsing + NODE_ENV flags

(C before B because .env mode-file selection in B depends on the NODE_ENV
flags existing.)

- [x] 2.1 RED: add `test/flags.test.mjs` (same plain-node style as
      `exit-codes.test.mjs`) with a fixture script that prints
      `process.env.NODE_ENV` (e.g. `test/fixtures/direct/print-node-env.ts`
      printing to stdout) covering:
      - `--production` → child sees `NODE_ENV=production`, exit 0.
      - `--development` → child sees `NODE_ENV=development`.
      - both flags → exit 1, stderr mentions the conflict.
      - no flag, ambient `NODE_ENV=staging` in the calling env → child sees
        `staging` (passthrough unchanged).
      - ambient `NODE_ENV=development` + `--production` → child sees
        `production` (flag wins).
      - flags are NOT forwarded to the wrapped script (fixture script prints
        its argv; assert `--production` absent).
      - `--` separator: `envoke ./print-args.ts -- --production` → the wrapped
        script RECEIVES `--production` and `NODE_ENV` is untouched.
      - `--verbose` still works and is still filtered from script args.
      Wire the new test file into `package.json` `test` script (run both test
      files, propagate failures).
- [x] 2.2 GREEN: extract argument parsing into `src/parseArgs.ts` — a pure
      function `parseArgs(argv: string[])` returning
      `{ script, scriptArgs, verbose, nodeEnv | undefined }` handling
      `--verbose`/`-v`, `--production`, `--development`, `--` separator, and
      the both-flags conflict (return/throw a typed error the caller turns
      into exit 1). Refactor `execute.ts` to use it; thread `nodeEnv` into the
      child env at BOTH spawn sites (`{ ...process.env, ...(nodeEnv && { NODE_ENV: nodeEnv }) }`).
- [x] 2.3 All checks green (`pnpm typecheck && pnpm build && pnpm test`).
      Commit (e.g. `feat: add --production/--development flags`). Tick boxes.
- [x] 2.4 REFACTOR (only if needed): tidy `execute.ts` after extraction;
      commit separately if changes are non-trivial. (No further refactor
      needed — the extraction left `execute.ts` clean.)

## Phase 3 — Task B: dotenv support

- [x] 3.1 Add `dotenv` as a runtime dependency
      (`pnpm add dotenv`). Check its latest release notes for breaking
      changes relevant to the API used. (Added dotenv 17.4.2; using
      `dotenv.parse`, which has no logging side-effects and silently skips
      malformed lines — unaffected by v17's `config()` logging changes.)
- [x] 3.2 RED: add `test/dotenv.test.mjs` + fixtures. Fixture scripts print
      selected env var values to stdout for assertions. Cases (every path,
      not just happy path):
      - `.env` in cwd is loaded (`FROM_ENV=cwd-env` visible to child).
      - `.env.local` overrides `.env` for the same key.
      - With `--production`: `.env.production` overrides `.env`/`.env.local`;
        `.env.production.local` overrides `.env.production`.
      - Without NODE_ENV: mode files are NOT loaded.
      - Real environment wins: caller-exported var is NOT overwritten by any
        `.env` file.
      - Monorepo case: fixture with root `.env` + nested-package cwd `.env` —
        cwd value wins for shared keys; root-only keys still visible.
        (Note: `getRootPath` walks to a `.git` directory — the fixture needs
        a `.git` marker directory, or point the test's cwd such that the real
        repo root is the "root"; prefer a self-contained fixture with an
        empty `.git` dir created by the test setup, cleaned up after.)
      - No `.env` files at all → script still runs fine (no error).
      - Malformed `.env` line → dotenv's lenient parsing applies; script
        still runs (document observed behaviour in the test).
      Wire into the `test` script.
- [x] 3.3 GREEN: implement `src/loadEnvFiles.ts` — pure-ish function
      `loadEnvFiles({ rootPath, cwd, nodeEnv }): Record<string, string>`
      that reads the candidate files in precedence order (root before cwd,
      base before local before mode before mode-local), dedupes
      root===cwd, parses with `dotenv.parse`, and merges (later wins within
      the file layers). In `execute.ts`, compose the final child env as:
      `{ ...loadedEnvFiles, ...process.env, ...(nodeEnv && { NODE_ENV: nodeEnv }) }`
      so real env beats files and the flag beats everything. Apply at BOTH
      spawn sites. `--verbose` logs which files were found/loaded (paths
      only, never values).
- [x] 3.4 All checks green. Commit (e.g. `feat: load .env files via dotenv`).
      Tick boxes.
- [x] 3.5 REFACTOR if needed; commit separately. (Not needed — loadEnvFiles
      is a focused module and execute.ts composition is clear.)

## Phase 4 — README + docs

- [x] 4.1 Update `README.md`:
      - Remove the two completed items from `## Todo` (delete the section if
        empty).
      - Document `.env` loading: which files, from where (root + cwd), the
        precedence table, and that real env always wins.
      - Document `--production` / `--development`, the conflict error, and
        the `--` separator.
      - Keep the existing tone/format (diff-style examples).
- [x] 4.2 Commit (e.g. `docs: document .env loading and env flags`).

## Phase 5 — Task D: cleanup + version/release reconciliation

- [x] 5.1 `git rm yarn.lock .yarnrc.yml` (pnpm is the package manager; these
      are stale migration leftovers). Confirm `pnpm install` still works and
      nothing references them (`rg -i "yarn" --glob '!plans/**' --glob '!README.md'` — README
      mentions of `yarn envoke` usage by CONSUMERS are fine and stay).
- [x] 5.2 Check the published npm state: `npm view @takken/envoke versions`.
      Record findings in this plan file:
      - If `0.1.6` IS published: note that only the git tag `v0.1.6` is
        missing (tagging happens after merge — flag it to the operator).
      - If `0.1.6` is NOT published: note that `0.1.6` was never released.

      **Findings (2026-07-23):**
      - npm published versions: `0.1.0`–`0.1.5`; `dist-tags.latest = 0.1.5`.
      - `0.1.6` is **NOT** published to npm — it was never released.
      - A git tag `v0.1.6` exists (on origin and locally) pointing at
        `main` HEAD (`1847638 fix: propagate wrapped script exit codes`),
        and `package.json` was already at `0.1.6`. So `0.1.6` was version-
        bumped and tagged but never published. This branch bumps straight to
        `0.2.0`; the operator should decide whether the orphan `v0.1.6` tag
        stays or is removed, and confirm the `0.2.0` publish (task 6.4).
- [x] 5.3 Bump `package.json` version to `0.2.0` (new features B + C are
      additive). Do NOT tag and do NOT publish — that is an operator decision
      post-merge.
- [x] 5.4 Full final verification from clean state:
      `rm -rf dist && pnpm install --frozen-lockfile && pnpm typecheck && pnpm test`.
- [x] 5.5 Commit (e.g. `chore: drop yarn artefacts, bump to 0.2.0`).

## Phase 6 — fold-back and handover

- [ ] 6.1 Fold-back pass: module names say what they ARE (`parseArgs`,
      `loadEnvFiles`); no comments referencing this plan's coordinates
      (rewrite any into domain-word invariants); no migration shims left.
- [ ] 6.2 Re-read the diff end-to-end (`git log --oneline main..`,
      `git diff main`) checking for stray debug code, unintended files,
      and that every commit passed checks.
- [ ] 6.3 All plan checkboxes above ticked; commit any final plan-file tick
      updates.
- [ ] 6.4 ASK THE OPERATOR (do not act without permission): permission to
      push `feat/ci-env-cleanup` and open a PR; report the 5.2 npm findings
      and ask how to handle tagging `v0.1.6`/`v0.2.0` and npm publishing.
