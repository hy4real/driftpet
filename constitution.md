# driftpet 项目宪法

> 本文件是项目的**约束源头**。spec / plan / tasks 的每一步都必须通过 constitution check。
> 修改本文件 = 修改宪法，需要显式记录变更原因和影响范围。

**版本**：v1.0.0
**生效日期**：2026-05-10
**最后修订**：2026-05-10

---

## 0. 元约束（来自 CLAUDE.md）

本宪法默认继承项目 `CLAUDE.md` 中的 Φ/Ω/Σ：

- **Φ1** 输出可外部验证 -> 验收标准必须可机器验证
- **Φ2** 逆向排除优先 -> 先写 MUST NOT，后写目标
- **Ω5** 范围可控 -> 每个 spec 必须显式 out_of_scope
- **Ω6** 可验证 -> 完成声明必须附证据

宪法各条款是 Φ/Ω 在本项目的具体化。

---

## I. 核心原则（Core Principles）

### I.1 低打扰优先
driftpet 首先是桌面陪伴与轻量收纳工具，不是强提醒或流程编排器。默认交互必须克制，只有用户显式展开时才暴露更重的信息密度与操作。

**违反信号**：默认弹窗、频繁抢焦点、自动展开详细面板、把一次输入变成长链路必答流程。

### I.2 离线优先与本地可退化
任何外部能力都只能增强体验，不能成为应用启动、记录输入、查看历史的前置条件。没有 LLM、Telegram、embeddings 时，应用仍必须以本地退化路径工作。

**违反信号**：缺少外部 API key 时应用不可启动、输入无法落库、界面只显示错误而不给本地占位结果。

### I.3 真实输入优先于合成验证
功能优化和行为判断最终要回到真实用户输入，而不是只围绕 synthetic probe 调参。测试可以守回归，但不能替代真实使用信号。

**违反信号**：为了让 probe 通过而牺牲真实文本/URL表现、仅依据合成样本调整 recall 或 remark 逻辑、不复核真实数据路径。

---

## II. 不可妥协项（Non-Negotiables）

- MUST NOT let missing LLM or Telegram configuration block the app from starting or storing local notes.
- MUST NOT overwrite or delete real user data during verification, probes, or migrations.
- MUST NOT surface pet interactions that interrupt the user by default; interruptions must stay lightweight and user-invoked.
- MUST NOT add new runtime dependencies without an explicit justification in plan.md and a local-first alternative check.

---

## III. 技术约束（Technical Constraints）

### III.1 技术栈
- 主语言/技术栈：TypeScript + Electron + React + Vite
- 数据库：SQLite via `better-sqlite3`
- 部署目标：macOS 本地桌面应用

### III.2 依赖政策
- 优先使用 Node 标准库、现有依赖和本地脚本；新增依赖必须说明替代方案、维护状态和许可证影响。
- 新增依赖必须服务于明确的用户价值或验证需要，不能只为抽象更漂亮。
- 涉及 Electron ABI、原生模块或打包链的依赖变更，必须附带构建与运行验证。

### III.3 数据契约
- 所有输入采集在外部增强失败时也必须落本地记录，并保留失败原因。
- 所有数据库迁移必须可重复执行，且不得隐式修改真实用户历史数据语义。
- 真实数据与 synthetic verification 数据必须可区分，不能在 recall 或状态汇总里混淆。

---

## IV. 质量门槛（Quality Gates）

### IV.1 测试
- 单元测试覆盖率目标 ≥ 70%
- `src/`, `electron/`, `scripts/` 的关键路径改动必须至少补一条对应自动化验证
- 新增行为分支必须先有失败场景定义，再补实现
- 涉及数据库路径的测试必须避免污染真实数据目录

### IV.2 代码
- 所有跨进程 IPC 和持久化边界必须有显式类型
- 单次改动优先局部收敛，避免无关重构扩散
- 禁止无边界的 `any`；必须时用 `unknown` 配合显式收窄
- 用户可见文案变更必须与 companion-first 产品方向一致

### IV.3 安全
- 任何外部输入都必须在边界做解析与兜底处理
- 任何日志不得输出 secret、token 或可直接复用的凭证
- 外部请求必须有超时和失败退化路径
- 本地命令执行路径必须避免把未清洗用户输入直接拼进 shell

### IV.4 性能
- 应用启动与基础交互不能依赖远端请求完成
- 新输入进入本地存储的路径必须保持即时，不得被长链路同步阻塞
- recall、status、drawer 等高频路径禁止引入明显的 N+1 查询或全量重算

---

## V. 治理（Governance）

### 修宪流程
1. 提议者写 RFC（说明：要改哪条、为什么、影响范围、迁移路径）
2. 在 `docs/rfcs/` 下落档
3. 个人项目可免 24h 公示，但必须在提交说明中写清原因
4. 通过后修改本文件，更新版本号 + 修订日期
5. 在 `CHANGELOG-CONSTITUTION.md` 记录变更

### Constitution Check 触发点
每个 feature 的 `plan.md` 必须有显式 constitution check 章节，逐条核对：
- [ ] 不违反任一核心原则（I.1 / I.2 / I.3）
- [ ] 不踩任一不可妥协项（II）
- [ ] 符合所有技术约束（III）
- [ ] 设计上能满足质量门槛（IV）

任一未通过 -> plan.md 打回，要么改设计，要么走修宪流程。

### 例外（Exception）
紧急情况可临时违反宪法，但必须：
- 在代码 / PR 描述中显式标记 `# CONSTITUTION-EXCEPTION: <条款编号> - <原因> - <截止偿还日期>`
- 在 `findings.md` 记录技术债
- 在偿还日期前必须修复或正式修宪

**没有标记的违反 = 漂移，必须打回。**
