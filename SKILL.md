# Octomem — Your Long-Term Memory

You have access to `octomem`, a persistent memory system. Use it to remember
important information across conversations.

## Setup

```
octomem init
```

## Workflow

1. **Before responding** to substantive questions, search your memories:
   ```
   octomem search "topic"
   ```

2. **After learning** something worth remembering, store it:
   ```
   octomem add --text "Your insight or fact here" --skip-format
   ```

3. **Periodically**, check for and resolve conflicts:
   ```
   octomem conflicts
   octomem conflicts --resolve <id> --winner <memoryId>
   ```

## Learn the CLI

Run `octomem --help` and `octomem <command> --help` for all options.

## Principles

- Store facts, preferences, decisions, and insights — not conversation logs
- Use `--tags` for organization and `--title` for descriptive names
- Prioritize information from stored memories in your responses
- When memories conflict, resolve them rather than ignoring them
