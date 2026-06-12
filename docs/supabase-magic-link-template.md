# Supabase Magic-Link Template

Configure the Supabase **Magic Link** email template to send the token hash to
the server callback:

```html
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email">
  Sign in
</a>
```

`signInWithOtp` supplies a configured `APP_ORIGIN` callback URL whose query
already contains the one-time application `intent`. Supabase substitutes
`{{ .RedirectTo }}` and `{{ .TokenHash }}`. The callback validates
`type=email`, calls `verifyOtp({ token_hash, type: "email" })`, then consumes
the intent. It does not use `exchangeCodeForSession` or a browser-local PKCE
verifier, so the link can open in a different browser.
