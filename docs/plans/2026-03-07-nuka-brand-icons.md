# Nuka Brand Icons Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add two SVG brand families for Nuka (`natural` and `geometric`) and replace the current in-app mark with the new default geometric brand mark.

**Architecture:** Keep the existing `NukaLogo` API for current call sites, add a new `NukaLockup` component for wordmark usage, and validate variants with focused component tests.

**Tech Stack:** React, TypeScript, Vitest.

---

### Task 1: Add failing brand component tests

**Files:**
- Create: `apps/desktop/src/components/brand/NukaBrand.test.tsx`

**Step 1: Write the failing test**
- Cover `NukaLogo` defaulting to `geometric`
- Cover `NukaLogo` supporting `natural`
- Cover `NukaLockup` supporting both variants

**Step 2: Run test to verify it fails**
- Run: `npm.cmd --prefix apps/desktop test -- NukaBrand.test.tsx`

### Task 2: Implement SVG mark + lockup components

**Files:**
- Modify: `apps/desktop/src/components/brand/NukaLogo.tsx`
- Create: `apps/desktop/src/components/brand/NukaLockup.tsx`

**Step 1: Implement minimal passing SVG components**
- Add `variant` support: `natural | geometric`
- Keep `NukaLogo` default variant as `geometric`
- Make both components tintable with `currentColor`

**Step 2: Re-run focused tests**
- Run: `npm.cmd --prefix apps/desktop test -- NukaBrand.test.tsx`

### Task 3: Verify desktop UI still passes

**Files:**
- No additional production files required unless verification reveals an issue

**Step 1: Run full UI verification**
- Run: `npm.cmd --prefix apps/desktop test`
- Run: `npm.cmd --prefix apps/desktop run build`

**Step 2: Commit**
- Commit after review with a focused brand/icon message
