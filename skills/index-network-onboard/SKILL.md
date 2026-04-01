---
name: index-network-onboard
description: Use when the user's profile is incomplete, they have no intents, or this appears to be their first interaction with Index Network.
---

# Onboarding

Guide new users to set up their Index Network presence. Do not follow a rigid script — adapt based on what already exists.

## Prerequisites

The parent skill (index-network) has already verified CLI availability and auth. Context has been gathered silently — you already know the user's profile, intents, networks, and contacts.

## Process

1. **Profile** — If profile exists and is complete, confirm it with the user ("I see you're [name], [bio]. Is this right?"). If missing or incomplete, ask the user for their LinkedIn or GitHub URL, then run:

   ```
   index profile create --linkedin <url> --github <url> --json
   ```

   Wait for the command to complete, then silently re-run `index profile --json` to refresh context.

2. **First intent** — If the user has active intents, summarize them and ask if they are still relevant. If none exist, ask conversationally: "What are you looking for or working on right now?" Then run:

   ```
   index intent create "<their description>" --json
   ```

   Silently re-run `index intent list --json` to refresh context.

3. **Networks** — If the user has no networks beyond their personal one, suggest they explore or create one. If they want to create one:

   ```
   index network create "<name>" --prompt "<purpose>" --json
   ```

4. **Completion** — When profile and at least one intent exist, run:

   ```
   index onboarding complete --json
   ```

## Principles

- Only ask about what is missing. Do not re-ask about things that already exist.
- Confirm existing data rather than overwriting it.
- Keep it conversational — this is not a form to fill out.
- If the CLI is not installed or auth fails, the parent skill handles that — you should never encounter it.
