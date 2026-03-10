# Desktop Runtime Neuroscience Memory Verification

## Checklist

- [x] Automated coverage proves bootstrap can initialize with bundled `PageIndex` while provider state is still missing.
- [x] Automated coverage proves `Knowledge` can rebuild and search through indexed content immediately after bootstrap.
- [x] Automated coverage proves `Chat`, `Workflow`, and `Agent draft` stay blocked until a default provider is configured.
- [x] Automated coverage proves provider-backed `Chat`, `Workflow`, and `Agent draft` flows work after provider setup.
- [x] Automated coverage proves `Chat` and `Workflow` show the three-way memory review dock and reviewed decisions update graph-backed memory state.
- [ ] Manual smoke test of a packaged installer on a fresh machine was not run in this session.

## Verification commands

```bash
cargo test --workspace
npm.cmd --prefix apps/desktop test
npm.cmd --prefix apps/desktop run build
```

## Resolved verification issues

1. `npm.cmd --prefix apps/desktop test`
   - Initial failure: `apps/desktop/src/App.test.tsx` did not mock `list_pending_memory_candidates`, so the new review dock contract returned `null` in tests.
   - Resolution: aligned the Tauri `invoke` fixture with the real backend contract by returning an empty candidate list and a successful review response.
2. `npm.cmd --prefix apps/desktop run build`
   - Initial failure: `ChatPage.test.tsx` and `WorkflowPage.test.tsx` inferred `never[]` for `listPendingMemoryCandidatesMock`.
   - Resolution: typed those mocks as `Promise<MemoryCandidate[]>` so `tsc` matches the real runtime contract.

## Latest results

Executed on `2026-03-10` in `D:\code\nuka-world\.worktrees\desktop-runtime-neuroscience-memory`:

- `cargo test --workspace`: PASS
  - Rust test suites passed, including bootstrap, provider gate, bundled knowledge runtime, workflow runtime, and memory review coverage.
- `npm.cmd --prefix apps/desktop test`: PASS
  - `8` test files passed.
  - `67` tests passed.
- `npm.cmd --prefix apps/desktop run build`: PASS
  - `tsc` passed.
  - Vite production build completed successfully.

## Packaging notes

- `apps/desktop/src-tauri/tauri.conf.json` already bundles `resources/pageindex/pageindex.cmd`.
- `apps/desktop/src-tauri/src/bootstrap.rs` resolves that resource from Tauri packaging first and only falls back to the local test path when the bundled resource is unavailable.
- `apps/desktop/package.json` already contained the required desktop `test` and `build` scripts before Task 8, so no additional package-script change was necessary in this task.
