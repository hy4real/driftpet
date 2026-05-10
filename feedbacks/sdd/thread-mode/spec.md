# Thread Mode Spec

## Context

driftpet 已经能把输入收成卡片，也能记住“上次那条线”，但连续性还停留在提示层。

现在的工作台和 Claude Code 派发仍然以单卡片为主，导致同一条工作线里的上下文在界面上散开，派发时也像是每次重新开题。

## Problem

当前连续性能力有两个缺口：

1. 用户看不到“这条线最近长了什么”
2. Claude Code 派发不能显式带上整条线的上下文

这会让 driftpet 的陪伴记忆停留在一句提醒，而不是可继续推进的工作线。

## Product Intent

`线头模式` 的第一版应该让连续输入更像同一条 ongoing thread，而不是一串彼此孤立的小卡片。

第一版不追求线程实体化，不做新表，不做后台聚类。
它只需要把现有信号收束成一个可见、可派发的 thread bundle。

## In Scope

### 1. 基于现有卡片信号推导 thread bundle

复用现有字段：

- `rememberedThread`
- `related`
- `knowledgeTag`
- recent card history

推导一个小而稳定的 bundle，默认只覆盖最近 2 到 5 张和当前线直接相关的卡片。

### 2. 在工作台里展示这条线

扩展 expanded workbench，让用户能看到：

- 当前线的锚点
- 这条线最近包含哪些卡片
- 点击某张卡可以重新查看它

### 3. 支持“派给 Claude Code（整条线）”

在连续模式下，工作台应允许把当前线作为一个显式 thread packet 派发给 Claude Code。

Prompt 必须清楚标记：

- 当前是 `thread` mode
- 当前卡片是什么
- 这条线里还有哪些相关卡片

## Out Of Scope

第一版不做：

- 新的 thread 数据表或 migration
- 跨会话持久 thread entity
- 自动 thread clustering
- 多条线并行管理界面
- 重新设计 recall / embeddings 策略
- 新的 agent / provider 系统

## User-Visible Acceptance

线头模式第一版正确时，用户可以说：

1. 打开小窝时，我能直接看到“这条线最近长了什么”。
2. 同一条线里的相关卡片会被聚在一起，而不是只剩一条 remembered-thread 提示。
3. 我可以点击这些卡片重新查看具体内容。
4. 我可以从工作台直接把“整条线”派给 Claude Code。
5. 连续模式和独立卡片模式仍然保持区分：独立模式不会展示虚假的 thread bundle。

## Constraints

- 第一版禁止引入新依赖。
- 第一版禁止新增数据库 schema。
- thread bundle 必须从现有内存数据面推导，而不是引入新的存储真相源。
- 对系统流程型 `knowledgeTag` 要保守，不能因为通用标签把不相干卡片串成一条假线。

## Open Questions

1. 第二版是否需要把 thread bundle 持久化成显式 thread entity？
2. 未来是否需要在 History Drawer 里也显示 thread 视角，而不是只有 workbench？
3. Claude Code 回流结果是否要重新挂回整条线，而不是只挂回单卡？
