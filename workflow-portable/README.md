# Workflow Portable

可跨项目迁移的 Agent 工作流约束包。

**它是什么**：一个 drop-in 的规则模板集合，把"收敛工程约束协议"+ "多线程派发/回报/QA 模板" + "JSON 任务包" 三层抽象按渐进式接入梯度组织起来。

**它不是什么**：不绑定 Claude Code / OpenCode / Codex 任何一个平台。不带运行时 hook、不带 npm 脚本、不带 daemon。纯文档 + JSON schema。

---

## 起源

本包从 `multi-agents-test/` 仓库的三个子项目蒸馏而来：

| 来源 | 贡献 |
|---|---|
| `AGENTS.md`（顶层收敛工程约束协议 v2.1） | Φ/Ω/Σ/Δ/Γ/Ξ 协议骨架 → `CLAUDE.md.template` |
| `workflow-kit/` | 7 状态、ID 格式、派发/回报/QA 三模板 → `templates/*.md` |
| `workflow-fusion/` | scope/out_of_scope/risk_boundary 字段、JSON 任务包 schema、`最小下一步` 字段 → 融合进上述模板 + `task-packet.json` |

砍掉了：原 OpenCode 子项目的目录结构（平台绑定）、原协议的 Ψ 自指性段（操作弱）、fusion 的 `response-guard.mjs`（无 hook 跑不起来）。

---

## 两条独立轨道

本包内有**两套互不耦合的能力**，按需启用：

### 轨道 A：协议 + 多线程协作（CLAUDE.md + templates/）

解决「**多 agent 怎么协作不漂移**」。L0→L3 渐进式：

```
L0  单 agent / 个人项目        └─ 只需 CLAUDE.md.template
L1  多线程，无独立 QA          └─ + templates/task-dispatch.md + thread-report.md
L2  多线程 + 独立 QA 角色      └─ + templates/qa-acceptance.md
L3  机器可读编排              └─ + templates/task-packet.json
```

### 轨道 B：Spec-Driven Development（spec-kit/）

解决「**新功能从想法到可执行任务**」。四步循环：

```
Specify → Plan → Tasks → Implement
spec.md   plan.md  tasks.md   代码
   └─────── constitution.md（贯穿四步的宪法）
```

详见 `spec-kit/README.md`。

### 何时用哪个

| 场景 | 用什么 |
|---|---|
| 个人项目、想法即清晰 | 只用 A 的 L0 |
| 个人项目、新功能要设计 | A 的 L0 + B（推荐起步组合）|
| 多 agent 协作、任务已定义 | A 的 L1+ |
| 多 agent + 新功能要设计 | A 的 L1+ + B |

**起步建议：A 从 L0 开始 + B 在做新功能时启用。** 多数项目稳定在这个组合。

---

## 目录

```
workflow-portable/
├─ README.md                    # 本文件
├─ init.sh                      # 一键接入脚本（交互式 / 无人值守 / dry-run）
├─ .workflow-init.conf.example  # --unattended 配置文件模板
├─ CLAUDE.md.template           # 【轨道A】项目级规则模板（精简收敛协议）
├─ templates/                   # 【轨道A】多线程协作模板
│  ├─ task-dispatch.md          #   派发模板（含 scope/risk_boundary）
│  ├─ thread-report.md          #   回报模板（含 最小下一步）
│  ├─ qa-acceptance.md          #   QA 验收模板（L2+）
│  └─ task-packet.json          #   JSON 任务包 schema（L3）
├─ spec-kit/                    # 【轨道B】Spec-Driven Development 模板
│  ├─ README.md                 #   SDD 入口
│  ├─ constitution.md.template  #   项目宪法
│  ├─ templates/
│  │  ├─ spec.md.template       #   需求规约（what & why）
│  │  ├─ plan.md.template       #   技术方案（how 高层）
│  │  └─ tasks.md.template      #   任务拆解（how 细节）
│  └─ docs/sdd-flow.md          #   SDD 完整流程
└─ docs/
   └─ adoption-guide.md         # 【轨道A】分级接入指南
```

---

## 30 秒上手

### 把整个文件夹放到新仓库 + 跑 init.sh

```bash
cp -r workflow-portable /path/to/new-repo/
cd /path/to/new-repo
bash workflow-portable/init.sh
```

`init.sh` 会交互式问 4 步：
1. 项目基本信息（名/类型/技术栈）
2. 验证与回滚（测试命令/回滚方式/关键路径）
3. 接入选择（L0-L3 + 是否启用 SDD）
4. Constitution 关键内容（核心原则/不可妥协项/覆盖率门槛，回车跳过保留占位符）

自动生成：
- `CLAUDE.md`（项目协议，槽位已填入）
- `constitution.md`（项目宪法 skeleton，待你填核心原则等内容）
- `specs/0001-<feature>/{spec,plan,tasks}.md`（可选）

已存在的文件会先备份为 `.bak.<timestamp>` 再覆盖。不在 git 仓库内运行时会警告。

### init.sh 参数

| 参数 | 说明 |
|---|---|
| `--dry-run` | 只预览将要写的文件，不实际写入 |
| `--unattended <file>` | 从配置文件读取所有字段，跳过交互（CI 场景） |
| `--force` | 与 `--unattended` 配合：遇到冲突文件自动覆盖（默认跳过） |
| `-h, --help` | 显示帮助 |

```bash
# 看一眼会创建什么
bash workflow-portable/init.sh --dry-run

# CI / 无人值守
bash workflow-portable/init.sh --unattended .workflow-init.conf

# CI + 强制覆盖
bash workflow-portable/init.sh --unattended .workflow-init.conf --force
```

配置文件格式见 `.workflow-init.conf.example`，所有字段都有注释。选填字段留空即保留 `{{...}}` 占位符。

### 之后做什么

- 编辑 `constitution.md` 填核心原则 / 不可妥协项 / 技术约束 / 质量门槛
- 用 SDD 流程开新 feature：见 `spec-kit/docs/sdd-flow.md`
- 升级到多 agent 协作（L1+）：见 `docs/adoption-guide.md`

### 不想用脚本？手动等价命令

```bash
cp workflow-portable/CLAUDE.md.template                CLAUDE.md
cp workflow-portable/spec-kit/constitution.md.template constitution.md
# 然后人工把所有 {{...}} 占位符替换掉
```

---

## 设计取舍

### 为什么是 L0 → L3 而不是一刀切

原 `workflow-kit` 默认假设 "总控 + 业务 + 测试 + QA" 四线程，单 agent 项目用不上。
原 `workflow-fusion` 上来就给 JSON schema，没自动化编排的项目跑不起来。
分级让你在**真的有协作需求时**才付组织成本。

### 为什么砍掉 Ψ 自指性段

学术上很优雅（协议自身要满足元方法论），但实操中没人会用它来纠协议本身。
省下篇幅强调 Lite 触发条件——后者高频被错用。

### init.sh 的边界

`init.sh` 只做一次性 scaffolding（模板复制 + 占位符替换），不带运行时、不带 hook、不带 daemon。
生成完毕后本包回归纯文档 + schema，Claude Code / Codex / OpenCode / Cursor 都能用。
如果你的平台支持 hook，可以自己包一层 validator，但不属于本包范围。

---

## 何时不该用本包

- 一次性脚本 / 玩具项目
- 不会持续多轮迭代的实验
- 已经有成熟工作流且团队已经熟悉
- 项目压力很小，引入约束反而增加摩擦

强约束有成本。只在收益（少返工、少漂移、可追溯）超过成本时才用。

---

## 维护

本包是源仓库 `multi-agents-test/` 的蒸馏版。源协议变更时手动同步：

- 顶层 `AGENTS.md` 改动 → 同步到 `CLAUDE.md.template` 的 Φ/Ω/Σ/Ξ 段
- `workflow-kit/*.md` 改动 → 评估是否合并进 `templates/*.md`
- `workflow-fusion/templates/*.json` 改动 → 评估是否同步 schema

不做反向同步（本包砍过的内容不要再加回源仓库）。
