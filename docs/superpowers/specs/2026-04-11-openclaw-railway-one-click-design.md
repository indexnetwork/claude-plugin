# Design: One-Click Railway Deploy for `indexnetwork/openclaw-railway-template`

## Goal

Make `indexnetwork/openclaw-railway-template` feel like a true one-click Railway deployment for the infrastructure layer: users should be able to click deploy, let Railway provision the service, then finish normal OpenClaw onboarding at `/setup`.

This design intentionally stops at infrastructure automation. It does not attempt to automate OpenClaw onboarding or Index Network plugin configuration.

## Scope

In scope:

- Make the fork the canonical Railway deployment target.
- Expose a clear Railway deploy path from documentation.
- Ensure the template provisions the expected runtime shape on Railway.
- Document the short post-deploy flow and webhook verification check.

Out of scope:

- Automatically configuring OpenClaw during deploy.
- Automatically wiring the Index Network plugin or webhook secret.
- Adding hidden runtime bootstrapping for setup credentials.

## User Experience

The target flow is:

1. The user clicks a `Deploy on Railway` button from the fork README or the OpenClaw plugin README.
2. Railway creates a new project from `indexnetwork/openclaw-railway-template`.
3. Railway provisions the wrapper service, a persistent volume mounted at `/data`, public networking, and required variables.
4. The deployment becomes healthy via `/setup/healthz`.
5. The user opens `/setup`, authenticates with `SETUP_PASSWORD`, and completes standard OpenClaw onboarding.
6. The user verifies webhook reachability by checking that `POST /index-network/webhook` returns `401 invalid signature`.

This is considered one-click because all infrastructure creation happens in the Railway template flow. The only remaining manual work is application-level onboarding inside OpenClaw.

## Recommended Approach

Use the existing fork as the canonical Railway template repo and improve the deployment surface around it rather than adding new wrapper logic.

Why this approach:

- It matches the intended scope: infra-only automation.
- It avoids fragile OpenClaw-specific preseed logic.
- It keeps the deployment story honest: Railway provisions the environment, OpenClaw is still configured in OpenClaw.
- It keeps maintenance low as upstream OpenClaw behavior evolves.

## Implementation Shape

### 1. Fork README as the primary product surface

Update `packages/openclaw-railway-template/README.md` so it clearly acts as the user-facing deploy entrypoint.

It should include:

- A prominent `Deploy on Railway` button near the top.
- A short explanation that this deploy path provisions the wrapper service, persistent storage, public ingress, and required variables.
- A short `After deploy` section that tells the user to open `/setup` and complete onboarding.
- A short webhook verification section that tells the user what success looks like for `/index-network/webhook`.

The README should not imply that OpenClaw is fully configured immediately after deployment.

### 2. Railway template configuration stays minimal and truthful

`railway.toml` remains the source of build and healthcheck configuration.

The expected Railway-managed shape is:

- Dockerfile-based build.
- Healthcheck path at `/setup/healthz`.
- Public domain enabled.
- Persistent volume mounted at `/data`.
- `PORT=8080`.
- Prompted or documented `SETUP_PASSWORD`.
- Optional `ENABLE_WEB_TUI`.

If Railway supports additional in-repo metadata for template prompts, those prompts may be added, but the design does not depend on richer metadata being available.

### 3. Plugin README points to the deployable path, not just the code fork

Update `packages/openclaw-plugin/README.md` to recommend `indexnetwork/openclaw-railway-template` as the deployable Railway path, not only as a fixed code fork.

The wording should make three things clear:

- this is the recommended Railway template for Index Network users,
- it includes the two webhook-critical wrapper fixes,
- users should deploy that template and then finish setup at `/setup`.

### 4. No new runtime automation in this phase

Do not add behavior such as:

- generating and persisting setup passwords automatically,
- reading env vars to pre-write OpenClaw config,
- auto-installing or auto-configuring the Index Network plugin,
- hidden first-boot setup steps that are not visible in docs.

Those ideas can be explored later if needed, but they are explicitly excluded from this design.

## Verification

The implementation is successful when all of the following are true:

- The fork README exposes a clear `Deploy on Railway` path.
- The deploy docs accurately describe what Railway provisions.
- The deploy docs accurately describe what the user still must do in `/setup`.
- The plugin README recommends the fork as the preferred Railway template.
- The post-deploy verification instructions still use the webhook `401 invalid signature` behavior as proof of HTTP reachability.

## Risks and Constraints

### Risk: overselling “one-click”

If the docs imply the app is fully configured immediately after Railway deploy, users will be confused when `/setup` still requires interaction.

Mitigation: consistently describe this as infrastructure one-click deploy plus application onboarding in `/setup`.

### Risk: Railway template behavior drifting from docs

If the template listing or repo config changes, the README may become inaccurate.

Mitigation: keep the README focused on stable guarantees and verify the deploy path during implementation.

### Constraint: OpenClaw onboarding remains the source of truth

The wrapper should not silently duplicate OpenClaw onboarding logic during this phase.

## Testing Strategy

Testing is documentation- and template-focused:

- verify README links and deploy button targets,
- verify `railway.toml` still matches the documented healthcheck and port behavior,
- verify plugin README language matches the actual fork behavior,
- verify the post-deploy curl guidance remains correct.

No new application behavior is introduced in this design, so no runtime feature tests are required beyond validating the existing deployment path and documentation accuracy.
