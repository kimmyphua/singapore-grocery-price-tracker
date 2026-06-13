# Simple Password Authentication Design

## Goal

Use Supabase email/password authentication without custom email templates,
magic-link intents, or application-specific session durations.

## Flow

The login page has **Sign in** and **Create account** modes. Both accept an
email and password. Supabase creates and refreshes the browser session using
its standard cookies. Email confirmation is disabled so account creation does
not depend on another email link.

Protected pages verify the Supabase user and claims, then upsert the local
`UserProfile` used to own tracked products. The existing `LoginIntent` and
`AppSession` database tables remain untouched but are no longer used at
runtime, avoiding a production schema migration for this auth simplification.

Signing out clears the local Supabase session and returns to `/login`.

## Errors

The UI returns generic validation, invalid-credentials, duplicate-account, and
temporary-provider messages. Provider details and secrets are never exposed.

## Verification

Cover sign-in, sign-up, session enforcement, and sign-out with tests. Run the
full test, typecheck, lint, Prisma validation, and production build suites,
then deploy and test account creation and sign-in on production.
