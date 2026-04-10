# Octomem

**一个「自洽」的 AI Agent 记忆系统。**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org/)

[English](README.md)

---

## 为什么做 Octomem

Octomem 的灵感来自**章鱼大脑**：9 个大脑（1 个中央 + 8 个触手），分布 & 自洽。

现在的 AI Agent 记忆系统本质上只做一件事：**存取**。写进去，读出来，完了。

问题是——记忆越积越多，矛盾越来越多，重复的条目不断膨胀，Agent 正在面临的是**记忆紊乱导致的人格分裂**。

我希望我的 Agent 可以有自己的三观，有自己对世界事物的看法和观点，不是一个左右皆可的 Bot。

## 核心亮点

- **Markdown 作为全量记忆载体**，你的记忆随时可以阅读/导出/带走；
- **全量 CLI 支持**，不要忘记这是一个 Agent 记忆系统；
- **SQLite + 向量 + 分段**，眼熟吧？OpenClaw 友好加倍！

## 横向比较

| | 存储与检索 | 矛盾检测 | 相似合并 | 置信度追踪 | 自我迭代 |
|---|:-:|:-:|:-:|:-:|:-:|
| MemGPT / Letta | ✅ | — | — | — | — |
| Mem0 | ✅ | 部分 | — | — | — |
| Engram | ✅ | 基础 | — | — | — |
| **Octomem** | ✅ | ✅ | ✅ | ✅ | 🔜 |

核心洞察：**写入前验证，比存储后检索更重要。**

> PS: 当然，“做梦”这种被浪漫包装的定时清理工作，Octomem 也会做。

### vs memory-lancedb

| | memory-lancedb | Octomem |
|---|---|---|
| **存储** | LanceDB 向量库 | SQLite + sqlite-vec + FTS5 |
| **搜索** | 纯向量搜索 | 混合搜索（向量 + 关键词 + MMR） |
| **写入** | 直接存，无处理 | Pipeline：format → structurize → validate → merge → index |
| **去重** | 无 | 重叠检测 + 自动合并 |
| **矛盾检测** | 无 | 矛盾发现 + 冲突追踪 |
| **置信度** | 无 | 每条记忆有 confidence score |
| **解决机制** | `memory_forget`（删除） | `resolveConflict`（智能解决） |

---

## 工作原理

**你的记忆永远不会被锁在私有格式里。** 

Markdown 文件是永久、人类可读的记忆归档，数据库只是一个搜索索引。

```
输入 → Format → Structurize → Validate → Merge → Index
                      ↑           ↑
                      │           └── 核心差异化
                      └── LLM 驱动的结构化提取
```

### Validate：守门人

每条记忆存入之前，Octomem 会先搜索已有记忆中相似的内容，然后通过 LLM 判断关系：

- **CONTRADICTS（矛盾）** → 标记冲突，阻止写入
- **OVERLAPS（重叠）** → 触发与已有记忆的合并
- **INDEPENDENT（独立）** → 安全写入

这意味着你的记忆库始终保持**干净和一致**——无重复、无矛盾，相互矛盾的信息在录入时就会被发现。

### 双层存储

| 层 | 格式 | 用途 |
|---|---|---|
| **Markdown 文件** | `memory/entities/{tag}/` | 永久载体，人类可读，可移植 |
| **SQLite 索引** | `memory/index.db` | 快速搜索（FTS5 + 向量） |

导出 = 复制 markdown 文件。数据库损坏？重新跑索引。

### 置信度追踪

每条记忆都有一个置信度分数（0.0 – 1.0）：

- **validate()** 赋予初始分数
- **merge()** 根据合并质量调整
- **≤ 0.1** → 进入归档候选

---

## 快速开始

### 前置条件

- [Node.js](https://nodejs.org/) >= 20
- 一个 Embedding 服务（任选其一）：
  - [Ollama](https://ollama.com)（本地，免费，推荐）
  - [硅基流动](https://cloud.siliconflow.cn)（云端，免费额度）
  - OpenAI（云端，付费）
- 一个 OpenAI 兼容的 LLM API Key（用于 validate 和 merge）

### 安装

```bash
git clone https://github.com/Lision/octomem.git
cd octomem
npm install
npm run build
```

### 配置

```bash
cp .env.example .env
```

编辑 `.env`：

```bash
# LLM（用于 validate 和 merge — 任何 OpenAI 兼容 API）
OPENAI_API_KEY=sk-your-key
# LLM_BASE_URL=https://your-provider.com/v1   # 可选，默认 OpenAI
# LLM_MODEL=gpt-4o-mini                        # 可选

# Embedding（用于搜索和相似度 — 与 LLM 独立配置）
# 方案 A：Ollama（推荐，免费）
#   1. 安装：https://ollama.com
#   2. 拉取模型：ollama pull bge-m3
EMBEDDING_BASE_URL=http://localhost:11434/v1
EMBEDDING_MODEL=bge-m3
```

### 试试看

```bash
# 初始化记忆库
npx octomem init

# 添加一条记忆
echo "# Rust vs Go\nRust 优先安全，Go 优先简洁。" > memo.md
npx octomem add memo.md

# 搜索
npx octomem search "编程语言"

# 添加相似记忆——观察合并机制
echo "# Go vs Rust\nGo 更简洁，Rust 更安全但学习曲线陡峭。" > memo2.md
npx octomem add memo2.md

# 查看冲突
npx octomem conflicts

# 列出标签
npx octomem tags
```

---

## CLI 命令参考

| 命令 | 说明 |
|---|---|
| `octomem init` | 初始化记忆数据库和实体目录 |
| `octomem add <file>` | 从文件添加记忆 |
| `octomem search <query>` | 语义搜索记忆 |
| `octomem conflicts` | 列出（或解决）待处理的冲突 |
| `octomem tags` | 列出所有标签及计数 |
| `octomem export [dir]` | 导出记忆为 markdown 文件 |
| `octomem resume` | 恢复中断的 staging 任务 |

---

## 许可证

[MIT](LICENSE)
