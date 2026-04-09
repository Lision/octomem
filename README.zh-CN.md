# Octomem

**一个自洽的 AI Agent 记忆系统。**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-green.svg)](https://nodejs.org/)

[English](README.md)

---

## 为什么做 Octomem

现在的 AI Agent 记忆系统本质上只做一件事：**存取**。写进去，读出来，完了。问题是——记忆越积越多，矛盾越来越多，重复的条目逐渐过时，没有人在做**一致性校验**。

Octomem 的灵感来自**章鱼大脑**：9 个大脑（1 个中央 + 8 个触手），分布式但自洽。一个不只存储、还会**维护一致性**的记忆系统。

### 差异在哪

| | 存储与检索 | 矛盾检测 | 相似合并 | 置信度追踪 | 自我迭代 |
|---|:-:|:-:|:-:|:-:|:-:|
| MemGPT / Letta | ✅ | — | — | — | — |
| Mem0 | ✅ | 部分 | — | — | — |
| Engram | ✅ | 基础 | — | — | — |
| **Octomem** | ✅ | ✅ | ✅ | ✅ | 🔜 |

核心洞察：**写入前验证，比存储后检索更重要。**

---

## 工作原理

**你的记忆永远不会被锁在私有格式里。** Markdown 文件是永久、人类可读的真相来源。SQLite 只是一个搜索索引。

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

这意味着你的记忆库始终保持**干净和一致**——无重复、无矛盾。

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
