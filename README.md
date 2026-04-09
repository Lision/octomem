# Octomem

**A "self-consistent" memory system for AI agents.**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org/)

[中文文档](README.zh-CN.md)

---

## Why Octomem

Octomem is inspired by the **octopus brain**: 9 brains (1 central + 8 arms), distributed yet self-consistent.

Most AI agent memory systems do one thing: **store and retrieve**. Write in, read out, done.

The problem? Memories pile up. Contradictions accumulate. Duplicates keep growing. What agents are facing is **memory chaos that leads to a split personality**.

I want my agent to have its own worldview — its own take on things — not a bot that says "both sides are fine."

## Highlights

- **Markdown as the source of truth** — your memories are always readable, exportable, and portable.
- **Full CLI support** — because this is an agent memory system, don't forget that.
- **SQLite + vectors + segmentation** — looks familiar? Double the OpenClaw friendliness!

## Comparison

| | Storage & Search | Contradiction Detection | Similarity Merge | Confidence Tracking | Self-Iteration |
|---|:-:|:-:|:-:|:-:|:-:|
| MemGPT / Letta | ✅ | — | — | — | — |
| Mem0 | ✅ | Partial | — | — | — |
| Engram | ✅ | Basic | — | — | — |
| **Octomem** | ✅ | ✅ | ✅ | ✅ | 🔜 |

The core insight: **validating before writing is more important than retrieving after storing**.

> PS: Of course, "dreaming" — the romantically packaged periodic cleanup — Octomem will do that too.

---

## How It Works

**Your memories are never locked in a proprietary format.**

Markdown files are the permanent, human-readable archive. The database is just a search index.

```
Input → Format → Structurize → Validate → Merge → Index
                      ↑           ↑
                      │           └── the core differentiator
                      └── LLM-powered extraction
```

### Validate: the gatekeeper

Before any memory is stored, Octomem searches existing memories for similar content, then uses an LLM to classify the relationship:

- **CONTRADICTS** → flag as conflict, block write
- **OVERLAPS** → trigger merge with existing memory
- **INDEPENDENT** → safe to store

This means your memory base stays **clean and consistent** — no duplicates, no contradictions. Conflicting information gets caught at the door.

### Dual-layer storage

| Layer | Format | Purpose |
|---|---|---|
| **Markdown files** | `memory/entities/{tag}/` | Permanent, human-readable, portable |
| **SQLite index** | `memory/index.db` | Fast search (FTS5 + vector) |

Export = copy markdown files. Database corrupted? Rebuild the index.

### Confidence tracking

Every memory gets a confidence score (0.0 – 1.0):

- **validate()** assigns the initial score
- **merge()** adjusts it based on overlap quality
- **≤ 0.1** → candidate for archival

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20
- An embedding service (pick one):
  - [Ollama](https://ollama.com) (local, free, recommended)
  - [SiliconFlow](https://cloud.siliconflow.cn) (cloud, free tier)
  - OpenAI (cloud, paid)
- An OpenAI-compatible LLM API key (for validate & merge)

### Install

```bash
git clone https://github.com/Lision/octomem.git
cd octomem
npm install
npm run build
```

### Configure

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# LLM (for validate & merge — any OpenAI-compatible API)
OPENAI_API_KEY=sk-your-key
# LLM_BASE_URL=https://your-provider.com/v1   # optional, defaults to OpenAI
# LLM_MODEL=gpt-4o-mini                        # optional

# Embedding (for search & similarity — independent from LLM)
# Option A: Ollama (recommended, free)
#   1. Install: https://ollama.com
#   2. Pull model: ollama pull bge-m3
EMBEDDING_BASE_URL=http://localhost:11434/v1
EMBEDDING_MODEL=bge-m3
```

### Try it

```bash
# Initialize memory store
npx octomem init

# Add a memory
echo "# Rust vs Go\nRust prioritizes safety, Go prioritizes simplicity." > memo.md
npx octomem add memo.md

# Search
npx octomem search "programming languages"

# Add a similar memory — watch merge kick in
echo "# Go vs Rust\nGo is simpler, Rust is safer but steeper learning curve." > memo2.md
npx octomem add memo2.md

# Check for conflicts
npx octomem conflicts

# List tags
npx octomem tags
```

---

## CLI Reference

| Command | Description |
|---|---|
| `octomem init` | Initialize memory database and entities directory |
| `octomem add <file>` | Add a memory from file |
| `octomem search <query>` | Semantic search across memories |
| `octomem conflicts` | List (or resolve) pending conflicts |
| `octomem tags` | List all tags with counts |
| `octomem export [dir]` | Export memories as markdown files |
| `octomem resume` | Resume interrupted staging jobs |

---

## License

[MIT](LICENSE)
