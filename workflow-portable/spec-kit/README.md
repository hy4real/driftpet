# Spec Kit

Spec-Driven Development (SDD) 模板集。**先写规约，再写代码**。

灵感来自 GitHub Spec Kit (`github/spec-kit`)，但去掉了 CLI 工具依赖，纯 Markdown 模板。

---

## 与 workflow-portable 的关系

**两套并列，互不耦合。** 按需启用。

| | spec-kit（本目录） | workflow-portable 其余 |
|---|---|---|
| 解决什么 | 想法 → 可执行任务列表 | 任务 → 多 agent 协作不漂移 |
| 何时启用 | 新功能从零开始设计 | 多 agent 派发/回报/QA |
| 产物在哪 | `specs/<feature>/` | 无固定路径，按 templates 用 |
| 是否必需 | 否 | 否 |

**典型组合**：
- 单人开发 + SDD = `CLAUDE.md` + `spec-kit/`，跳过 `templates/`
- 多 agent + 任务已定义 = `CLAUDE.md` + `templates/`，跳过 `spec-kit/`
- 全套 = 三层都用，`spec-kit` 出 tasks.md → `templates/task-dispatch.md` 派发执行

---

## SDD 四步循环

```
Specify         Plan            Tasks           Implement
   │              │                │                │
   ▼              ▼                ▼                ▼
spec.md  ─→   plan.md   ─→   tasks.md    ─→   代码 + 测试
(what+why)   (how 高层)     (how 细节)        (按 task 顺序)
   ▲              ▲                ▲                │
   └──────────────┴────────────────┴────────────────┘
                  constitution.md（贯穿四步的不变约束）
```

每一步的产物都要通过 **constitution check**——不符合宪法的设计直接打回。

---

## 目录

```
spec-kit/
├─ README.md                       # 本文件
├─ constitution.md.template        # 项目宪法（约束源头，全局唯一）
├─ templates/
│  ├─ spec.md.template             # 需求规约
│  ├─ plan.md.template             # 技术方案
│  └─ tasks.md.template            # 任务拆解
└─ docs/
   └─ sdd-flow.md                  # 完整流程 + 走通示例
```

每个 feature 的 `spec.md` / `plan.md` / `tasks.md` 应放在：

```
<your-repo>/
├─ specs/
│  ├─ 0001-user-auth/
│  │  ├─ spec.md
│  │  ├─ plan.md
│  │  └─ tasks.md
│  └─ 0002-payment/
│     └─ ...
└─ constitution.md   ← 复制自 spec-kit/constitution.md.template
```

Feature ID 用 `MMDDTxxx` 或 `0001/0002` 都行，全项目保持一致即可。

---

## 30 秒上手

新功能开工时：

1. **Specify**：复制 `templates/spec.md.template` 到 `specs/<feature-id>/spec.md`，填需求
2. **Plan**：复制 `templates/plan.md.template` 到同目录，写技术方案 + 跑 constitution check
3. **Tasks**：复制 `templates/tasks.md.template`，按 plan 拆任务
4. **Implement**：按 `tasks.md` 顺序做，每完成一个就 ✅

详见 `docs/sdd-flow.md`。

---

## 与 Slash Commands 配合（可选）

如果你用 Claude Code，可以把这四步绑成 slash command（`.claude/commands/`）：

- `/specify <feature>` → 创建 feature 目录 + 填 spec.md 模板
- `/plan` → 基于当前 spec 生成 plan.md
- `/tasks` → 基于 plan 生成 tasks.md
- `/implement` → 按 tasks 顺序进入执行模式

本包不提供这些 command 实现（避免平台绑定），但模板设计预留了配合空间——所有模板顶部都有清晰的输入/输出标记。

---

## 何时不用 SDD

- bug fix（直接改即可，写 spec 是仪式过载）
- 单文件小改动
- 探索性脚本 / 一次性任务
- 已经有清晰需求的小功能

**SDD 的成本回收点**：功能跨多个文件 / 涉及数据模型变更 / 涉及 API 契约 / 多人协作。
低于这个门槛 = 不要用，直接写代码。
