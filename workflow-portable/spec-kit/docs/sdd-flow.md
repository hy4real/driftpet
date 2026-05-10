# SDD 完整流程

Spec-Driven Development 的四步循环 + 一份贯穿全流程的项目宪法。

---

## 流程图

```
┌─────────────────┐
│ constitution.md │ ◀──── 项目宪法（一次性建立，全局唯一）
└────────┬────────┘
         │ 约束
         ▼
   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
   │ Specify  │───→│   Plan   │───→│  Tasks   │───→│Implement │
   │ spec.md  │    │ plan.md  │    │ tasks.md │    │  代码 +   │
   │          │    │          │    │          │    │  测试     │
   │ what+why │    │ how 高层 │    │ how 细节 │    │           │
   └──────────┘    └────┬─────┘    └──────────┘    └────┬─────┘
                        │  ▲                              │
                        │  └──────────────────────────────┘
                        │  失败 → 回头改设计                │
                        ▼
                  Constitution Check
                  失败 → 改方案 / 走修宪
```

---

## 完整接入流程（新仓库第一次用）

### Step 0：项目宪法（一次性）

```bash
cp workflow-portable/spec-kit/constitution.md.template constitution.md
# 填写：核心原则、不可妥协项、技术约束、质量门槛
```

宪法没填完，后面 spec 都没法做 constitution check。

### Step 1：Specify（每个 feature 第一步）

```bash
mkdir -p specs/0001-user-auth
cp workflow-portable/spec-kit/templates/spec.md.template specs/0001-user-auth/spec.md
```

填 `spec.md`：
- 一句话摘要
- 用户故事
- 验收场景（Given/When/Then）
- FR / NFR
- Out of Scope
- Open Questions（必须清空才能进 Plan）

**这一步禁止写 how**。出现"建一张 X 表"就是错位。

### Step 2：Plan（spec 通过评审后）

```bash
cp workflow-portable/spec-kit/templates/plan.md.template specs/0001-user-auth/plan.md
```

填 `plan.md`：
- **Constitution Check**（必填，逐条核对）
- 架构总览
- 数据模型
- API 契约
- 实现策略（拆 Phase，但不写具体 task）
- 风险与缓解

**这一步禁止写具体 task 列表**。

### Step 3：Tasks（plan 通过后）

```bash
cp workflow-portable/spec-kit/templates/tasks.md.template specs/0001-user-auth/tasks.md
```

填 `tasks.md`：
- 按 5 个 Phase 拆 task（Setup / Tests First / Core / Integration / Polish）
- 每个 task 带验收 + 依赖
- `[P]` 标记可并行任务
- 画依赖关系图

**TDD 强制：Phase 2（Tests First）必须在 Phase 3（实现）之前完成。**

### Step 4：Implement

按 `tasks.md` 顺序执行：
- 一次只做一个 task（除非有 `[P]` 标记）
- 完成立即勾 `[x]`
- 卡住进 BLOCK，登记到 tasks.md 的"阻塞登记"
- 用 `CLAUDE.md` 的六态格式 (FREEZE/WIP/DELIVER/BLOCK/LEARN) 控制每一步

如果项目还启用了 `templates/` 多线程协作，这一步可以把 task 用 `task-dispatch.md` 派发给执行线程。

---

## 走通示例（最小可行 feature）

假设你要做：用户登录（邮箱+密码）。

### specs/0001-user-login/spec.md（节选）

```md
## 0. 一句话摘要
让注册用户用邮箱+密码登录，登录后获得 7 天有效期的 session。

## 2. 用户故事
作为已注册用户，我想要用邮箱密码登录，以便访问个人面板。

## 3. 验收场景
### Scenario 1: 正确凭证登录成功
- Given 用户 alice@x.com 已注册，密码为 "secret123"
- When 用户用 alice@x.com / secret123 提交登录
- Then 系统返回 session token，有效期 7 天

### Scenario 2: 错误密码登录失败
- Given 用户 alice@x.com 已注册
- When 用户用 alice@x.com / wrongpass 提交
- Then 系统返回 401，不泄漏"密码错误"还是"用户不存在"

### Edge Cases
- 5 次失败后账户锁定 15 分钟
- 邮箱大小写不敏感

## 6. Out of Scope
- 不做第三方登录（Google/GitHub）
- 不做密码找回（独立 feature）
- 不做记住我（独立 feature）
```

### specs/0001-user-login/plan.md（节选）

```md
## 1. Constitution Check
- [x] 不违反 I.1 (用户数据最小化)：只读 email + password hash
- [x] 不踩 II.1 (密码必须 bcrypt + salt)：用 bcrypt cost=12
- [x] 技术栈匹配 (III.1)：用现有 Next.js + Postgres

## 3. 数据模型
新增 sessions 表：
- id, user_id, token_hash, expires_at, created_at, last_used_at
迁移可回滚：是

## 4. API 契约
POST /api/auth/login
Request:  { email, password }
Response: { session_token, expires_at } | 401
Errors:   401 (统一错误信息), 429 (锁定)
```

### specs/0001-user-login/tasks.md（节选）

```md
## Phase 2: Tests First
- [ ] T201 [P] Contract test: 正确凭证 → 200 + token
- [ ] T202 [P] Contract test: 错误密码 → 401
- [ ] T203 [P] Contract test: 5 次失败 → 429

## Phase 3: Core
- [ ] T301 数据库迁移：sessions 表
- [ ] T310 实现 verifyPassword(email, password)
- [ ] T320 实现 POST /api/auth/login
```

完成 T320 后，T201/T202 应该都变绿。

---

## 何时跳过 SDD

不是所有改动都要走完整四步。

| 改动类型 | 走 SDD 吗 |
|---|---|
| Bug fix (单文件) | ❌ 直接改 |
| 文案修改 | ❌ 直接改 |
| 重构（不改外部行为） | ❌ 直接改，写好测试 |
| 新功能（涉及数据/API/多文件） | ✅ 走完整流程 |
| 新功能（小，单文件，无新依赖） | 🟡 简化版：只写 spec + tasks，跳过 plan |
| 探索原型（要扔掉的） | ❌ 直接做 |
| 上线后的紧急修复 | ❌ 直接修，事后补 spec |

**判断标准**：如果不写 spec，3 个月后没人能解释"这功能为啥这么做"——那就值得写 spec。

---

## 反模式

### 1. spec.md 里写 how
```
错: 用 PostgreSQL 的 jsonb 字段存配置
对: 系统必须能持久化用户配置
```
how 进 plan，不进 spec。

### 2. plan.md 里跳过 Constitution Check
没核对宪法 = 没真正做 plan。哪怕只有 3 条原则也要逐条勾。

### 3. tasks.md 不分 Phase
所有 task 平铺 = 失去 TDD 红绿灯节奏 + 失去并行机会。

### 4. 跳过 Tests First
直接进 Phase 3 = 开始累积"以后再补测试"的债，必然不补。

### 5. 边做边改 spec
spec 评审通过后就锁定。需求变更 → 单独写 v2 spec，不动 v1。

### 6. constitution.md 写得像愿景
```
错: 我们追求高质量的代码
对: 函数 ≤ 50 行，文件 ≤ 800 行，单测覆盖率 ≥ 80%
```
宪法必须可机器验证。

---

## 与 CLAUDE.md 的协议如何配合

`CLAUDE.md` 的六态状态 (CHAT/FREEZE/WIP/DELIVER/BLOCK/LEARN) 在 SDD 各步的对应：

| SDD 步骤 | 主要状态 |
|---|---|
| Specify | FREEZE（在写需求规约这件事上冻结边界）|
| Plan | FREEZE（设计冻结后才进入 WIP）|
| Tasks | FREEZE（任务清单冻结）|
| Implement (单 task) | WIP → DELIVER 或 BLOCK |
| Feature 整体完成 | LEARN（提炼经验、反模式回流）|

也就是说：spec/plan/tasks 三步本质都是 **FREEZE 阶段的细分**——把"开工前要冻结什么"展开成三层规约。
