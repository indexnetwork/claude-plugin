# MCP OAuth Plugin Design

**Date:** 2026-04-03
**Status:** Approved

## Goal

Enable users to install the Index Network Claude plugin and be automatically prompted to connect their account via browser OAuth — no manual token configuration. Identical UX to the Linear plugin on the Claude Marketplace.

## Flow

```
User installs plugin
  → Claude Code reads plugin/.mcp.json
  → registers "index-network" MCP server at https://protocol.index.network/mcp
  → hits /mcp unauthenticated
  → gets 401 with WWW-Authenticate: Bearer + resource_metadata URL
  → fetches /.well-known/oauth-authorization-server
  → POSTs to /oauth2/register (dynamic client registration)
  → opens browser to /oauth2/authorize with PKCE params
  → Better Auth checks session:
      - no session → /login → return to /oauth2/authorize
      - session exists → /oauth/consent
  → /oauth/consent auto-approves, redirects to Claude Code's localhost callback
  → Claude Code exchanges code for token at /oauth2/token
  → MCP tools available ✓
```

## Changes

### 1. `protocol/src/lib/betterauth/betterauth.ts`

Change `allowUnauthenticatedClientRegistration` from `false` to `true`.

**Why:** Claude Code dynamically registers itself as an OAuth client before auth exists. Blocking this creates a chicken-and-egg problem.

### 2. `protocol/src/controllers/mcp.handler.ts`

On 401 responses, add header:
```
WWW-Authenticate: Bearer realm="index-network", resource_metadata="https://protocol.index.network/.well-known/oauth-authorization-server"
```

**Why:** Claude Code uses this header to auto-discover the OAuth server. Without it, the client must know the discovery URL in advance.

### 3. `frontend/src/app/oauth/consent/page.tsx` (new)

- On mount: POST to Better Auth's consent approval endpoint with params from the URL
- If session is missing: redirect to `/login?return_to=<current URL>`
- Shows a brief loading state only — no "Grant access?" button
- On approval: Better Auth redirects to Claude Code's localhost callback with the authorization code

**Why:** Better Auth's `oauthProvider` is configured with `consentPage: "/oauth/consent"` but this page doesn't exist yet. Auto-approve means no friction beyond login.

**Implementation note:** Confirm the exact consent approval endpoint and payload from `@better-auth/oauth-provider` source/docs before building the page.

### 4. `frontend/src/routes.tsx`

Add route: `path: "/oauth/consent"` → `import("@/app/oauth/consent/page")`

### 5. `plugin/.mcp.json` (new)

```json
{
  "index-network": {
    "type": "http",
    "url": "https://protocol.index.network/mcp"
  }
}
```

No auth headers. Claude Code discovers and handles OAuth automatically via the WWW-Authenticate header and `/.well-known/oauth-authorization-server`.

## What Already Exists

- `/.well-known/oauth-authorization-server` — exposed via Better Auth's `oauthProvider` plugin
- `/oauth2/authorize`, `/oauth2/token`, `/oauth2/register` — handled by Better Auth
- MCP server at `/mcp` — already validates Bearer JWTs issued by Better Auth
- `/login` page — already exists, handles unauthenticated users

## Out of Scope

- Token refresh (Better Auth handles this)
- Consent revocation UI
- Marketplace listing (separate effort)
