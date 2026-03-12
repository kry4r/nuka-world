## Team Runtime Provider Hard Cut Verification

Date: 2026-03-12
Worktree: `D:\code\nuka-world\.worktrees\team-runtime-hard-cut-coordinator`
Branch: `codex/team-runtime-hard-cut-coordinator`

### Scope

This verification covers the approved `team runtime provider hard cut` design and implementation plan, with real UI-driven verification through Tauri MCP against the desktop app.

### Automated Verification

#### Frontend

Command:

```bash
npx vitest run --pool=threads src/App.test.tsx src/features/chat/ChatPage.test.tsx src/features/settings/SettingsPage.test.tsx
```

Result:

- Passed: 3 test files
- Passed: 41 tests
- Failed: 0

#### Desktop Tauri

Command:

```bash
cargo test -p desktop-tauri
```

Result:

- Passed: 55 tests
- Failed: 0
- Verified desktop bootstrap, provider secret handling, settings round-trip, workspace session listing, memory review surface, and workflow command removal assertions.

#### Provider Integration

Command:

```bash
cargo test -p nuka-integrations
```

Result:

- Passed: 3 tests
- Failed: 0
- Verified the expanded default OpenAI-compatible request timeout behavior.

#### Runtime

Command:

```bash
cargo test -p nuka-runtime
```

Result:

- Passed: 38 tests
- Failed: 0
- Verified flexible team generation hydration, team persistence, provider preflight gating, team run execution, and workspace/runtime behavior.

### Real Tauri MCP Smoke

Provider used for live smoke:

- Base URL: `https://api.daiju.live/v1`
- Model: `MiniMax-M2.5`
- Secret entry path: Settings UI only
- Secret storage target: Windows Credential Manager / keyring

#### Settings

Verified through page interaction:

1. Opened `Settings`.
2. Opened `Providers`.
3. Updated the provider secret via the password input.
4. Saved and observed `Secret saved`.
5. Confirmed the password field did not echo the saved secret.
6. Confirmed provider metadata remained visible while the secret stayed hidden.
7. Confirmed `Default Provider` showed `Daiju MiniMax`.
8. Confirmed decorative helper microcopy was removed from the Settings surface.

#### Connection Checks

Verified through page interaction and run behavior:

1. With `Connection checks` enabled, started a team run from `Team`.
2. Observed `provider_check_passed` and `Provider preflight` in the run event feed.
3. Returned to `Settings > Providers`.
4. Disabled `Connection checks` and saved.
5. Returned to the existing `TEAM RUN GoalOutlineTeam Run` tab in `Chat`.
6. Sent a follow-up instruction through the run composer.
7. Observed new `user_instruction`, `round_agenda`, `position_card`, and `checkpoint_summary` events.
8. Confirmed no new `provider_check_passed` event was added after the setting was turned off.

#### Chat / Team / Session Flow

Verified through page interaction:

1. Opened `Chat`.
2. Created a new team from natural-language intent.
3. Observed `Team created: GoalOutlineTeam`.
4. Opened `Team`.
5. Edited the existing team template fields:
   - description
   - prompt constraints
   - permission policy
   - assigned agents
6. Saved and observed `Team saved.`
7. Started a run from `Team`.
8. Returned to `Chat`.
9. Observed the run in the top tab strip as `TEAM RUN GoalOutlineTeam Run`.
10. Switched to the run tab.
11. Sent follow-up instructions and observed run state/feed updates.

#### Close Behavior

Verified through real window behavior:

1. In `Settings > Runtime`, confirmed `Close behavior` initially showed `Minimize to tray`.
2. Clicked the real window close button.
3. Confirmed the main window became hidden while the Tauri process and MCP connection remained alive.
4. Restored the window and changed `Close behavior` to `Quit app`.
5. Saved the runtime settings.
6. Clicked the real window close button again.
7. Confirmed the desktop app process exited.

#### Restart And Recovery

Verified after restarting `cargo tauri dev`:

1. Reconnected to the restarted desktop app through Tauri MCP.
2. Confirmed the `TEAM RUN GoalOutlineTeam Run` tab recovered automatically.
3. Confirmed the recovered tab reopened the same team run session.
4. Confirmed `Settings > Providers` still showed:
   - `Daiju MiniMax` as the default provider
   - `Secret saved`
   - `Connection checks` disabled
5. Confirmed `Settings > Runtime` still showed `Close behavior = Quit app`.

### SQLite Secret Audit

Database path audited:

- `C:\Users\gxy\AppData\Roaming\com.nukaworld.desktop\nuka-world.sqlite3`

Audit method:

- Queried provider rows from SQLite.
- Verified every provider row had `length(token) = 0`.
- Verified the live provider row had a populated `secret_ref` and `secret_present = 1`.
- Searched all text columns in all SQLite tables for values matching `'%sk-%'`.
- Scanned the raw database bytes for the `sk-` prefix.

Audit result:

- No plaintext API key found in SQLite text columns.
- No `sk-` prefix found in raw database bytes.
- Provider metadata persisted as expected.
- Secret reference/state persisted as expected.

### Product Assertions Verified

- `Chat` is the session entry and execution surface for live team runs.
- `Team` is edit-only for existing templates and can launch runs without hosting execution.
- Team runs appear in the `Chat` top tab strip and can be resumed there.
- Provider metadata is stored in SQLite while the secret remains outside SQLite.
- UI and command paths used in verification did not echo the real API key.
- `default provider`, `connection checks`, and `close behavior` are live, persistent, and observable.

### Remaining Notes

- The primary workflow command surface is removed and desktop tests assert workflow commands are no longer registered.
- Some internal workflow terminology still exists in non-primary runtime/test areas, but it is not exposed as the main user flow.
