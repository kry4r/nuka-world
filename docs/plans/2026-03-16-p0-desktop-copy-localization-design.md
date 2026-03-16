# P0 Desktop Copy And Localization Design

**Scope:** `Chat`, `Team`, `Agents`, `Memory`, `Settings`, shared shell, and shared desktop text that is visible from those P0 surfaces.

**Goal:** Remove low-value helper copy, make the visible desktop UI default to Chinese, and add a lightweight language switch without pulling the app into a full cross-product localization project.

## Boundaries

- Stay inside P0 desktop surfaces only.
- Do not touch `Knowledge` or other non-P0 product areas as part of this pass.
- Do not change runtime/storage semantics to support localization.
- Do not add placeholder or explanatory copy to replace removed helper text.

## Product Decisions

### 1. Copy cleanup

- Remove helper sentences that do not carry operational value.
- Keep labels, section titles, button text, state text, and error text that are required to use the app.
- Prefer shorter operational copy over descriptive prose.

### 2. Localization model

- Use a lightweight in-app dictionary owned by the desktop frontend.
- Default locale is `zh-CN`.
- Support at least `zh-CN` and `en-US`.
- Persist the selected locale locally so restart recovery keeps the user’s choice.

### 3. Settings entry point

- Put the language switch in `Settings > Appearance`.
- Keep the control visually consistent with the flat P0 input/select styling.
- Do not add a second locale switch anywhere else in the shell.

### 4. Text ownership

- Shared shell owns navigation labels and reusable chrome text.
- Each P0 page owns its page-specific visible strings.
- Shared chat components own run-state labels and compact notices that appear inside chat.

## UI Impact

- Sidebar labels and page titles should render in Chinese by default.
- Agents draft helper copy is removed rather than translated.
- Team run tabs, status labels, and agent labels should use the same dictionary path as the rest of chat.
- Session tab behavior stays browser-like; localization must not reintroduce layout overflow or hover instability.

## Testing Strategy

- Add regression tests for locale defaulting and locale switching at the shell/settings level.
- Add focused page tests for removed helper copy where those strings currently exist.
- Re-run targeted chat tests because tab widths and visible labels change under Chinese copy.
- Validate in the real Tauri app after each page batch instead of waiting for the end.
