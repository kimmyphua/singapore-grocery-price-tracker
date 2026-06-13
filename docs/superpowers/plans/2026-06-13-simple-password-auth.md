# Simple Password Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fragile magic links with standard Supabase email/password authentication.

**Architecture:** Supabase owns browser sessions. The app validates the current Supabase user and upserts `UserProfile`; custom login intents and application-session expiry are removed from runtime code.

**Tech Stack:** Next.js App Router, TypeScript, Supabase Auth, Prisma, Vitest

---

### Task 1: Password Actions And Form

**Files:**
- Modify: `src/lib/auth/login.ts`
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/login/login-form.tsx`
- Test: `tests/auth-routes.test.ts`

- [ ] Write failing tests for sign-in, sign-up, validation, and safe errors.
- [ ] Run the focused tests and confirm they fail for missing password APIs.
- [ ] Implement the minimal Supabase password actions and two-mode form.
- [ ] Run the focused tests and confirm they pass.

### Task 2: Supabase-Only Session Enforcement

**Files:**
- Modify: `src/lib/auth/session.ts`
- Modify: `src/lib/auth/signout.ts`
- Modify: `src/app/auth/signout/route.ts`
- Delete: `src/app/auth/callback/route.ts`
- Delete: `src/lib/auth/callback.ts`
- Test: `tests/auth-session.test.ts`
- Test: `tests/auth-routes.test.ts`

- [ ] Write failing tests showing a verified Supabase session is sufficient.
- [ ] Remove `AppSession` reads/writes and login-intent callback code.
- [ ] Preserve profile upsert, session validation, and local sign-out.
- [ ] Run focused auth tests.

### Task 3: Configure And Deploy

**Files:**
- Delete: `docs/supabase-magic-link-template.md`

- [ ] Enable email/password and disable email confirmation in Supabase.
- [ ] Run `npm test`, `npm run typecheck`, `npm run lint`, `npx prisma validate`, and `npm run build`.
- [ ] Deploy to Vercel and verify production account creation, sign-out, and sign-in.
