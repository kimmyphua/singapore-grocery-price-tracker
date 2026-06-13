# Supabase Magic-Link Template

The app works with the default Supabase template. The standard magic link
returns a PKCE `code` to `/auth/callback`, where the server calls
`exchangeCodeForSession`, consumes the one-time application intent, and creates
the requested 24-hour or 30-day application session.

If custom SMTP is configured, the template can instead send the token hash
directly to the server callback:

```html
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">
  Sign in
</a>
```

`signInWithOtp` supplies a configured `APP_ORIGIN` callback URL whose query
already contains the one-time application `intent`. Supabase substitutes
`{{ .RedirectTo }}` and `{{ .TokenHash }}`. The callback validates
`type=email`, calls `verifyOtp({ token_hash, type: "email" })`, then consumes
the intent. This optional form does not require a browser-local PKCE verifier,
so the link can open in a different browser.
