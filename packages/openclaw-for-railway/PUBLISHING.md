# Publishing this repo as a Railway template

These steps run once, by a maintainer with a Railway account, to turn this
repo into a clickable one-click template.

## 0. Repo topology

`packages/openclaw-for-railway/` in the `indexnetwork/index` monorepo is a
git subtree. The monorepo's pre-push hook at `scripts/hooks/pre-push`
automatically runs `git subtree push --prefix=packages/openclaw-for-railway`
on pushes to `dev` or `main`, mirroring the subtree to
`github.com/indexnetwork/openclaw-for-railway` on the matching branch
(`dev` → `dev`, `main` → `main`). Railway reads from the public mirror,
never from the monorepo path.

If the pre-push hook is not already aware of this subtree, add it:

```
# In scripts/hooks/pre-push, append a subtree entry:
packages/openclaw-for-railway|github.com/indexnetwork/openclaw-for-railway
```

(Exact format depends on the existing hook; follow the pattern already used
for `packages/cli`, `packages/protocol`, and `packages/openclaw-plugin`.)

## 1. Push the monorepo `dev` branch

Once the subtree is registered in the pre-push hook, pushing the monorepo
`dev` to the canonical `indexnetwork/index` remote auto-pushes the subtree
to `github.com/indexnetwork/openclaw-for-railway`. Verify the mirror is up
to date before proceeding.

## 2. Create a new template in the Railway dashboard

1. Sign in to Railway → Templates → Create Template.
2. Source: GitHub repo → `github.com/indexnetwork/openclaw-for-railway`.
3. Branch: `dev` (or `main` for stable).
4. Root directory: `/` (the mirror is standalone).
5. Builder: detected from `railway.toml` (DOCKERFILE).

## 3. Declare the variable prompts

In the template form, declare each variable:

| Name | Type | Value / prompt |
|---|---|---|
| `OPENCLAW_PROVIDER` | enum | options `openai`, `gemini` — user-selected |
| `OPENAI_API_KEY` | secret | user-prompted, required when provider=openai |
| `GEMINI_API_KEY` | secret | user-prompted, required when provider=gemini |
| `OPENCLAW_GATEWAY_TOKEN` | generated | `${{secret(64)}}` |
| `OPENCLAW_HOOKS_TOKEN` | generated | `${{secret(64)}}` |
| `GOG_KEYRING_PASSWORD` | generated | `${{secret(32)}}` |
| `PORT` | fixed | `18789` |
| `XDG_CONFIG_HOME` | fixed | `/data/.openclaw` |

## 4. Attach the persistent volume

- Mount path: `/data`
- Size: 1 GB is plenty for provider-backed memory search.

## 5. Enable public networking

- Public domain: yes.
- Port: `18789`.

## 6. Publish and test

- Publish the template. Railway assigns a template ID.
- Take the ID and update the README deploy button URL to replace
  `REPLACE_TEMPLATE_ID`. Commit the README update in the monorepo and push
  `dev`; the pre-push hook will propagate the update to the subtree mirror,
  which Railway will then pick up automatically for future deploys.

## 7. Sanity deploy

Click the button in a fresh Railway account, supply a real OpenAI or Gemini
API key, and run the post-deploy checklist in the README. Verify:

- Gateway responds on the public domain.
- Control UI accepts the auto-generated gateway token.
- `curl -X POST https://.../hooks/ping` returns 401 unauthenticated.
- Memory/semantic search is active in the Control UI status panel.
