## Desktop Frontend Restructure Verification

Date: 2026-03-11

### Environment

- Worktree: `D:\code\nuka-world-desktop-restructure`
- Branch: `feat/desktop-frontend-restructure`
- OS: Windows x86_64
- Tauri: `2.10.3`
- Runtime app identifier: `com.nukaworld.desktop`
- Runtime database: `C:\Users\gxy\AppData\Roaming\com.nukaworld.desktop\nuka-world.sqlite3`
- Verification backup: runtime database copied to `.codex-temp/nuka-world.sqlite3.bak` before temporary provider and knowledge smoke mutations

### Commands Run

```powershell
cd apps/desktop
npm test -- src/features/chat/ChatPage.test.tsx
npm test -- src/App.test.tsx src/features/chat/ChatPage.test.tsx src/features/workflow/WorkflowPage.test.tsx src/features/settings/SettingsPage.test.tsx src/features/knowledge/KnowledgePage.test.tsx src/features/agents/AgentsPage.test.tsx src/features/memory/MemoryPage.test.tsx
npm test
npm run build

cd D:\code\nuka-world-desktop-restructure
cargo test -p desktop-tauri workflow -- --nocapture
cargo test -p desktop-tauri knowledge -- --nocapture
cargo test -p desktop-tauri
```

Observed results:

- `src/features/chat/ChatPage.test.tsx`: `12 passed`
- focused frontend page suite: `68 passed`
- full frontend suite: `70 passed`
- frontend build: passed
- `cargo test -p desktop-tauri workflow -- --nocapture`: `11 passed`
- `cargo test -p desktop-tauri knowledge -- --nocapture`: `8 passed`
- full desktop backend suite: `48 passed`

### Tauri MCP Observations

#### Chat

- Provider-ready landing rendered only the logo hero and composer.
- Native Windows title bar was absent. The custom title bar rendered `Nuka World Desktop` with custom window controls.
- `Create workflow` rendered as a compact pill beside `+` with no dropdown:
  - pill width `208px`
  - input width `346px`
  - body height `900`, body scroll height `900`
- `Choose workflow` rendered as the same pill family with a dropdown listbox containing `Research Brief`, `Release Notes`, and `Customer Triage`.
- `Choose workflow` set the composer placeholder to an empty string, keeping the field visually quiet.

Provider-missing smoke:

- Temporarily deleted `provider-draft-1` and `provider-local` through `window.__TAURI__.core.invoke(...)`.
- After remounting `Chat`, the page kept the same logo-plus-composer structure and rendered only an inline message:
  - `default provider not found: provider-local`
  - inline `Open Settings` action
  - disabled textarea and send button
- Restored both providers immediately after the check.

#### Workflow

- Left catalog and right explanation layout rendered in the real app.
- No `Workflow Room`, no inspector rail, and no freeform canvas were present.
- The page kept global height stable:
  - body height `900`, body scroll height `900`
  - only the right detail pane scrolled (`workflow-page__detail-scroll` measured `1249 / 770`)
- Entering `Search the knowledge base before drafting` and clicking `Generate improved version` produced a preview with:
  - `Preview changes`
  - `Apply version`
  - `Keep editing`

#### Settings

- Compact directory navigation rendered these sections:
  - `General`
  - `Providers`
  - `Appearance`
  - `Shortcuts`
  - `Runtime`
- No top-level runtime banner or oversized navigation cards appeared.
- Global page height remained stable with no body scroll expansion.

#### Knowledge

Empty-state check:

- With no connector, the page rendered:
  - `Folder path`
  - `Add Folder`
- Search did not appear before a connector existed.

Populated-state smoke:

- Added temporary connector path `D:/code/nuka-world-desktop-restructure/.codex-temp/knowledge-smoke`
- Rebuild returned `Indexed 1 document from 1 connector`
- Searching `desktop verification flow` returned:
  - collection `User Knowledge Base`
  - path `D:/code/nuka-world-desktop-restructure/.codex-temp/knowledge-smoke/release-notes.md`
  - snippet `pageindex rebuild and snippet retrieval for the desktop verification flow.`
- Secondary sections stayed collapsed behind `Index activity` and `Engine details`

#### Agents

- Real runtime with no saved agents rendered only the generation surface:
  - heading `Generate an agent`
  - one request input
  - one `Create` action
- No persistent library/editor/inspector split appeared.

#### Memory

- Live runtime data was not empty, so the real page loaded a scoped graph instead of the empty state.
- Scope filter rendered at the top with at least:
  - `Release Notes`
  - `World`
- The graph remained the dominant surface with no permanent inspector rail.
- Clicking the visible node opened the overlay detail card.
- The overlay exposed `Close node detail`, and the close control dismissed the card successfully.

### Screenshots And Snapshot Notes

- Native screenshots were captured during:
  - chat landing
  - chat create-workflow pill
  - chat choose-workflow pill
  - workflow catalog/detail
  - settings compact directory
  - knowledge empty state
  - knowledge populated search state
  - agents empty state
  - memory graph and node detail overlay
- Accessibility snapshots were used as the source of truth for semantic checks and visible action names.

### Tooling Notes

- `webview_interact` and `webview_find_element` failed against snapshot refs with `window.__MCP__.resolveRef is not a function`.
- Continued verification with:
  - `webview_execute_js`
  - `webview_dom_snapshot`
  - native `webview_screenshot`
- This was a bridge limitation during verification, not an observed app regression.

### Final Smoke Notes

- `Maximize window` button toggled the Tauri window state from `false -> true -> false`.
- `Minimize window` button moved the window into the expected Windows minimized state:
  - width `160`
  - height `28`
  - x `-32000`
  - y `-32000`
- `Close window` hid the window instead of terminating the process, which matches the tray-backed close policy:
  - `visible: false`
- The runtime capability set intentionally allows:
  - `close`
  - `minimize`
  - `toggle-maximize`
- During verification, `unminimize` was not permitted by the capability file. That did not block any user-facing titlebar control, but it did prevent programmatic restore during the MCP smoke sequence.

### Follow-Up Fixes And Deviations

- `Memory` could not be validated in a pristine empty-state runtime without clearing existing local app data. The live database already contained scoped memory content, so runtime verification focused on graph-first layout, scope filtering, and the temporary node detail overlay.
- `Knowledge` populated-state verification intentionally used a temporary smoke connector under `.codex-temp/knowledge-smoke`. Restore the runtime database backup after final smoke verification if the local app state needs to return to its pre-verification baseline.
- After the final smoke sequence, the runtime process was stopped, the sqlite backup was restored, and `.codex-temp` was removed so the local app state returned to its pre-verification baseline.
