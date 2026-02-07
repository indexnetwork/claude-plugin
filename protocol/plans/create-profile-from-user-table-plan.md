# Plan: Create Profile from User Table + Parallel searchUser (no scrape_url)

## Goal

Re-implement profile creation in chat so that **create_user_profile** uses **user-table data** (name, email, linkedin, x, github, websites, location) and **Parallel’s searchUser** (struct-based) to fetch profile-relevant content, then invokes the **profile graph** to generate and save the profile. This avoids relying on **scrape_url** for profile creation and prevents getting stuck on signup/login walls (LinkedIn, etc.).

**Scope:** Plan only — no implementation.

---

## Current Behavior

- **create_user_profile** tool takes `action` and optional `details`.
- Agent is instructed to call **scrape_url** first for profile URLs, then pass scraped content in `details`.
- Tool concatenates action + details and invokes **ProfileGraph** with `input: inputForProfile`, `operationMode: "write"`, `forceUpdate: true`.
- If the user provided no input, the profile graph’s **scrape node** runs: it loads the user, builds a **single string objective** from name/email/socials, and calls `scraper.scrape(objective)` → `searchUser({ objective })` (string form). So the graph can already fetch via search when input is empty, but the flow is “no details → graph scrapes with string objective.”
- Using **scrape_url** for LinkedIn etc. can hit login/signup walls; the old **ProfileService.generateProfile** used **searchUser with a struct** (name, email, linkedin, x, github, websites) so Parallel could resolve without our app hitting those pages.

---

## Target Behavior

1. **Primary path for create_user_profile**
   - Load **user record** from DB (`database.getUser(userId)`). Tool context already has a database that implements `getUser` (ChatGraphDatabase / composite includes it).
   - Build a **search request** from **user table only** (no user_profile):  
     `name`, `email`, `location`, `socials.linkedin`, `socials.x`, `socials.github`, `socials.websites`.
   - If at least one of (name, email, any social) is present:
     - Call **searchUser** with the **struct** form:  
       `{ name, email, linkedin, twitter, github, websites }`  
       (map `user.socials.x` → `twitter`; optionally include location in the objective string if the API or our struct builder supports it).
   - Format **search results** into a single string (e.g. title + excerpts per result, same style as old ProfileService: `json2md` or equivalent).
   - Invoke **profile graph** with:
     - `userId`
     - `operationMode: "write"`
     - `input`: formatted search result (and optionally user-provided `details`/`action` appended, if we want to allow “also use what I pasted”).
     - `forceUpdate: true` (or as needed).
   - Profile graph then runs **generate_profile** (and embed/hyde) without needing to run its **scrape node** (because input is already provided).

2. **When user has no usable data**
   - If user has **no** name, email, or any social:
     - Either return a clear error: e.g. “Add your name, email, or a profile link (LinkedIn, X, GitHub) in account settings so I can build your profile,” or
     - If the user provided **details** (pasted text / “create from the following”), use **only** that as `input` and still invoke the profile graph (no searchUser call).

3. **Role of scrape_url**
   - **Do not** require scrape_url for initial profile creation when we have user-table data.
   - scrape_url remains for:
     - One-off URLs the user pastes that are **not** already in their account (e.g. a single article or repo for **intent** context, or an extra link they don’t want to save to socials).
     - Optional: if we later support “update my profile from this URL” and the URL is not in socials, we could still use scrape_url for that single page (with existing profile-objective handling in the adapter).

4. **update_user_profile**
   - Leave as-is for this plan: still uses profileId + action + optional details. No change to the “create from user table + searchUser” flow.

---

## Data Source (User Table Only)

Use only fields that exist on the **user** record (not user_profile):

- `name`
- `email`
- `location`
- `socials.linkedin`
- `socials.x` (Twitter/X)
- `socials.github`
- `socials.websites` (array)

Map these into **ParallelSearchRequestStruct**: `name`, `email`, `linkedin`, `twitter`, `github`, `websites`. Location can be appended to the objective string when building from struct (current `searchUser` turns struct into one string server-side).

---

## Implementation Points (for later)

1. **create_user_profile tool** (e.g. in `chat.tools.ts`):
   - After “no existing profile” check:
     - `const user = await database.getUser(userId)`.
     - Build struct from user (name, email, socials, optionally location).
     - If struct has at least one usable field: call `searchUser(struct)` (from `lib/parallel/parallel.ts`), format results to a string, set `input = formattedSearchResult` (and optionally concatenate `args.details` / `args.action` if provided).
     - If struct is empty and `args.details` is provided: set `input = args.details` (and optionally `args.action`).
     - If struct is empty and no details: return error asking user to add info or paste content.
   - Invoke profile graph with `input` as above; no change to graph signature.

2. **Profile graph**
   - No change required: when `input` is non-empty and “meaningful,” the scrape node is skipped and generation runs on that input.

3. **searchUser**
   - Already supports struct in `lib/parallel/parallel.ts` (`ParallelSearchRequestStruct`). Keep using it; only call site moves from “graph scrape node” to “create_user_profile tool” for this path.

4. **Agent / prompt**
   - Update system prompt so that:
     - For **creating** a profile: the agent does **not** need to call scrape_url first; it can call **create_user_profile** with an optional action (e.g. “Create my profile from my account info”). Backend will use user table + searchUser + profile graph.
     - scrape_url is for specific URLs the user pastes (e.g. for intents or one-off context), not required for profile creation.

5. **Tests**
   - Add/update tests for create_user_profile:
     - User with socials/name/email: mock `getUser` and `searchUser`; assert searchUser called with struct, profile graph invoked with formatted input, profile created.
     - User with no socials/name/email but with details: no searchUser; profile graph invoked with details only.
     - User with no data and no details: error returned.

---

## Out of Scope (this plan)

- Changing the profile graph’s internal scrape node (it can remain as fallback when graph is invoked elsewhere without input).
- Changing update_user_profile flow.
- Adding new API surface to Parallel (we use existing searchUser struct).
- Frontend or account-settings UI for editing name/email/socials (assume they already exist when present).

---

## Summary

| Aspect | Current | Target |
|--------|--------|--------|
| Profile creation input | scrape_url → details, or graph scrape (string objective) | User table (name, email, socials, location) → searchUser(struct) → formatted string → profile graph |
| scrape_url for profile | Required for URLs | Not required; only for one-off pasted URLs if needed |
| Who calls searchUser | Graph scrape node (string objective) or ScraperAdapter | create_user_profile tool (struct), then profile graph with pre-filled input |
| Profile graph | Invoked with or without input; scrapes if no input | Invoked with input from searchUser + optional details; scrape node skipped when input provided |
