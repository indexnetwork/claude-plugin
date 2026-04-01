---
name: index-network-discover
description: Use when the user asks to find people, explore opportunities, get introductions, or discover matches for their needs.
---

# Discovery

Help users find relevant people through opportunity discovery.

## Prerequisites

The parent skill (index-network) has already verified CLI availability and auth. Context has been gathered silently.

## Modes

- **Open discovery** — User describes what they need:

  ```
  index opportunity discover "<query>" --json
  ```

- **Targeted discovery** — User names a specific person. Use their user ID:

  ```
  index opportunity discover "<query>" --target <user-id> --json
  ```

- **Introduction** — User wants to connect two people:

  ```
  index opportunity discover --introduce <user-id-1> <user-id-2> --json
  ```

Note: Discovery can take up to 3 minutes. Let the user know you're looking.

## Process

1. Understand what the user is looking for. If vague, help them refine it into a clear query.
2. Run the appropriate discovery command.
3. Present results conversationally — highlight why each match is relevant, what the confidence score means, and what the opportunity reasoning says.
4. If the user wants to act on an opportunity:

   ```
   index opportunity accept <id> --json
   ```

   If they want to skip:

   ```
   index opportunity reject <id> --json
   ```

## Managing Opportunities

- List pending/accepted/rejected:

  ```
  index opportunity list --status <status> --json
  ```

- Show full details:

  ```
  index opportunity show <id> --json
  ```

- Help the user understand the actors, interpretation, and reasoning behind each opportunity.
