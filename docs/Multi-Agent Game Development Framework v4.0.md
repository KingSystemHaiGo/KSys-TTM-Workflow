# Multi-Agent Game Development Framework v4.0

> 基于 Claude Agent SDK Task Tool 的多 Agent 协作游戏开发方法论
>
> 总结自实际项目实战经验，修正了首次实践中的所有流程缺陷

---

## 目录

1. [核心理念](#1-核心理念)（含铁律 #5 零门槛交付、架构目标）
2. [团队架构](#2-团队架构)
3. [共享上下文系统 (Project Brain)](#3-共享上下文系统-project-brain)（含 3.6 文档大小控制与拆分策略）
4. [开发阶段与门禁](#4-开发阶段与门禁)（Phase 6a 含"第零层"自动化检测 🔴）
5. [可视化与进度追踪](#5-可视化与进度追踪)
6. [错误恢复机制](#6-错误恢复机制)
7. [项目规模适配](#7-项目规模适配)
8. [附录：经验教训](#8-附录经验教训)
9. [平台概况：TapTap 制造](#9-平台概况taptap-制造)（含 9.5 多 Agent 协作适配要点）
10. [可用工具与能力](#10-可用工具与能力)（含 LSP/真机反馈/测试二维码 🔴）
11. [Token 优化与成本控制](#11-token-优化与成本控制)（含 11.5 链路效率优化）
12. [自动化 QA 与闭环验证](#12-自动化-qa-与闭环验证) 🆕（**两条通道 + 可选加速器**架构 🔴：快速通道 LSP + 实机通道 Puppeteer + 可选 Dry-Run 沙箱 + AI 自动修复闭环）

---

## 1. 核心理念

### 1.1 四条铁律

| # | 铁律 | 说明 |
|---|------|------|
| 1 | **构建前置** | 项目开始的第一件事是验证 build 工具和预览链路，而非写代码 |
| 2 | **增量验证** | 每完成一个模块就 build + 预览，不攒到最后 |
| 3 | **文件即通信** | Agent 之间通过共享文件传递上下文，不依赖口头约定 |
| 4 | **用户可见** | 所有中间产出放在 `docs/` 目录下，用户可随时审查、修改、纠偏 |
| 5 | **零门槛交付** | 整套流程的终极目标：让没有任何游戏开发经验的用户也能获得可游玩且有品质的成品 |

### 1.2 架构约束

- **Agent 模型**：Claude Agent SDK 的 Task Tool，每个 subagent 拥有独立 200K 上下文
- **通信方式**：Flat 架构，所有 subagent 由主编排器（Orchestrator）调度
- **subagent 不能嵌套 spawn**，也不能直接互相通信
- 所有跨 Agent 信息传递必须通过 **文件系统 + Orchestrator 转发**

### 1.3 Orchestrator 的职责

主会话（用户直接交互的 Claude）担任 Orchestrator 角色：

```
Orchestrator 职责：
  - 阶段调度：按流程推进各 Phase
  - 门禁检查：每个 Phase 结束时验证产出物
  - 上下文注入：为每个 Agent 准备输入文件路径和任务描述
  - 冲突仲裁：当 Agent 产出矛盾时做裁决
  - 构建触发：在关键节点调用 build 工具
  - 进度可视化：通过 TodoWrite 实时更新状态面板
```

### 1.4 架构目标与交付边界

**架构目标**：本框架服务的核心用户是 **没有任何游戏开发经验的普通人**。多 Agent 协作的意义不是炫技，而是：

| 目标 | 具体含义 |
|------|----------|
| **更高效** | 并行化 + 精确分工，缩短从需求到可玩原型的路径 |
| **更精准** | 专人专责 + 同行审查，减少理解偏差和设计盲区 |
| **更少错误** | 门禁清单 + 运行时验证 + 增量构建，尽早发现并修复问题 |
| **零门槛** | 用户只需描述"想做什么游戏"，框架负责交付可游玩的成品 |

**交付边界**：本框架的最终产出是 **通过构建且可预览运行的游戏**。是否发布、何时发布完全由用户审查决定，不属于框架流程范围。

> **设计哲学**：框架中每一个流程步骤、每一个门禁检查项、每一个角色分工，都在回答同一个问题——"如何确保一个完全不懂代码的人，也能通过这套系统拿到一个能玩的、有品质的游戏？"**

---

## 2. 团队架构

### 2.1 设计原则

团队规模不是固定的，而是 **根据任务量动态决定**。以下是基于某中型文字游戏项目实测工作量的分析：

```
实测工作量分布（按代码行数）：

  核心逻辑层  game_logic.lua     1449 行  ████████████████████  最重
  事件页面    ui_events.lua      1289 行  █████████████████     很重
  数据定义    game_data.lua      1262 行  █████████████████     很重
  主界面框架  ui_main.lua        1019 行  █████████████         重
  状态管理    game_state.lua      967 行  ████████████          重
  列表页面A   ui_tenants.lua      716 行  █████████             中
  升级页面    ui_upgrades.lua     596 行  ████████              中
  UI工具库    ui_utils.lua        490 行  ██████                轻
  入口整合    main.lua            115 行  ██                    轻
```

**关键发现**：
- UI 层总计 4110 行，超过核心层 3678 行 — **UI 是最重的工作**
- 单个 Agent 处理 4000+ 行代码容易达到上下文上限
- 策划文档约 15KB，涉及机制设计、数值设计、内容填充三个不同技能领域

### 2.2 完整团队（18 人）

按职能分为 6 个组，每组人数根据实际任务量配置：

```
                        ┌─────────────────────┐
                        │    Orchestrator     │
                        │   (主会话/总指挥)    │
                        └──────────┬──────────┘
                                   │
  ┌──────────┬──────────┬──────────┼──────────┬──────────┬──────────┐
  ▼          ▼          ▼          ▼          ▼          ▼          ▼
┌────────┐┌─────────┐┌────────┐┌──────────┐┌────────┐┌────────┐┌────────┐
│ 产品组 ││ 策划组  ││ 架构组 ││  开发组  ││ 美术组 ││ QA 组  ││ 运维组 │
│ (2人)  ││ (4人)   ││ (2人)  ││  (5人)   ││ (2人)  ││ (3人)  ││  ---   │
└────────┘└─────────┘└────────┘└──────────┘└────────┘└────────┘└────────┘
```

> 运维组职责（构建/部署）由 Orchestrator 直接承担，不单独设 Agent。

---

### 2.3 产品组（2 人）

产品组是整个项目的"起点"，在策划之前完成市场调研和产品定位，确保团队不是在"闭门造车"：

| 角色 | 代号 | 技能领域 | 职责 | 产出物 |
|------|------|----------|------|--------|
| 产品经理 | PM1 | 市场分析 | 竞品调研、目标用户画像、市场机会分析、核心卖点定位 | `market-research.md` |
| 产品策略师 | PM2 | 产品定义 | 基于调研结论定义产品范围、核心体验目标、MVP 功能边界、成功指标 | `product-brief.md` |

**为什么需要产品组**：
- 没有市场调研，策划容易凭感觉设计，做出"自嗨"的作品
- 没有核心定位，开发过程中容易功能蔓延、方向摇摆
- 竞品分析能避免重复造轮子，也能发现差异化机会
- MVP 边界定义防止团队做太多（代码膨胀）或做太少（缺少核心体验）

**组内协作流程**：

```
Step 1:
  PM1 → 联网搜索同类游戏 → 竞品分析 → 目标用户画像
       → 输出 market-research.md

Step 2:
  PM2 → 读 market-research.md
       → 定义产品核心体验、MVP 功能清单、优先级排序
       → 输出 product-brief.md
```

**market-research.md 应包含**：
```markdown
## 竞品分析
| 竞品名 | 核心玩法 | 优势 | 劣势 | 可借鉴点 |
|--------|----------|------|------|----------|
| ... | ... | ... | ... | ... |

## 目标用户画像
- 年龄段/玩家类型
- 核心需求（打发时间/社交/成就感/创造力...）
- 游玩场景（碎片时间/长时间沉浸/通勤路上...）

## 市场机会
- 同类游戏的空白点或做得不好的地方
- 差异化方向建议
```

**product-brief.md 应包含**：
```markdown
## 产品核心定位
- 一句话描述: "这是一款___的___游戏"
- 核心体验关键词: (最多3个)
- 目标用户: (来自市场调研)

## MVP 功能清单
| 优先级 | 功能 | 必要性理由 |
|--------|------|-----------|
| P0 必做 | ... | 没有则不成立 |
| P1 应做 | ... | 显著提升体验 |
| P2 可做 | ... | 锦上添花 |

## 成功指标
- 核心循环完整可玩
- 新手前5分钟不流失
- ...

## 明确不做的功能
- (列出容易被提出但不在 MVP 范围内的功能)
```

---

### 2.4 策划组（4 人）

策划工作包含三个不同的技能领域，不应由同一人包办：

| 角色 | 代号 | 技能领域 | 职责 | 产出物 |
|------|------|----------|------|--------|
| 系统策划 | D1 | 机制设计 | 核心玩法循环、经济模型、系统间耦合关系 | `mechanics-draft.md` |
| 数值策划 | D2 | 数值建模 | 公式设计、成长曲线、平衡性验算、数值表 | `numerical-draft.md` |
| 内容策划 | D3 | 内容创作 | 文案、剧情、事件描述、角色设定、对话文本 | `content-draft.md` |
| 审查策划 | D4 | 质量把关 | 交叉审查 D1/D2/D3 的产出，检查一致性和完整性 | `design-review.md` |

**组内协作流程**：

```
Step 1 (并行):
  D1 → mechanics-draft.md（核心机制框架）
  D2 → numerical-draft.md（数值体系初稿，基于 D1 的机制假设）

Step 2:
  D3 → 读 mechanics + numerical → content-draft.md（内容填充）

Step 3:
  D4 → 读全部三份初稿 → design-review.md（一致性审查 + 修改建议）

Step 4:
  D1 → 综合所有材料 → design-doc.md（最终合并版）
```

**为什么需要 4 人**：
- D1 擅长系统性思维，设计"骨架"
- D2 擅长数学建模，设计"数值"
- D3 擅长创意写作，填充"血肉"
- D4 作为局外人视角，发现三人各自看不到的矛盾

---

### 2.5 架构组（2 人）

架构设计和代码审查是两种不同的思维模式，由不同人承担更有效：

| 角色 | 代号 | 职责 | 产出物 |
|------|------|------|--------|
| 架构师 | TL | 技术选型、模块拆分、依赖关系设计、API 契约定义 | `architecture.md`, `api-contracts.md` |
| 审查员 | TR | Code Review、接口一致性检查、性能问题扫描、整合 main.lua | `review-report.md`, `main.lua` |

**分工原则**：
- TL 负责"设计"：在代码开始前定义架构和接口
- TR 负责"验证"：在代码完成后审查实现是否符合架构
- TR 同时负责编写 `main.lua`（整合入口），因为审查过程中已通读所有模块

**组内协作流程**：

```
Phase 2:
  TL → architecture.md + api-contracts.md

Phase 4:
  TR → 读全部代码 → review-report.md（审查报告）
  TR → 编写 main.lua（整合入口）
  TL → 读 review-report → 确认架构偏离度，决定是否需要重构
```

---

### 2.6 开发组（5 人）

根据实测工作量，将代码按 **模块复杂度和代码量** 均匀分配：

| 角色 | 代号 | 负责模块 | 预估行数 | 工作量 | 文件所有权 |
|------|------|----------|----------|--------|------------|
| 数据工程师 | E1 | 纯数据定义 | ~1200 行 | 中 | `game_data.lua` |
| 逻辑工程师 | E2 | 状态管理 + 核心逻辑 | ~2400 行 | 重 | `game_state.lua`, `game_logic.lua` |
| UI 框架工程师 | E3 | 主界面框架 + UI 工具库 | ~1500 行 | 中重 | `ui_main.lua`, `ui_utils.lua` |
| UI 页面工程师 A | E4 | 高交互页面（事件流、社交动态等） | ~1300 行 | 重 | `ui_events.lua` 及同类复杂页面 |
| UI 页面工程师 B | E5 | 列表展示页面（角色管理、升级商店等） | ~1300 行 | 中 | `ui_tenants.lua`, `ui_upgrades.lua` 及同类页面 |

**可选扩展**（大型项目）：

| 角色 | 代号 | 负责模块 | 触发条件 |
|------|------|----------|----------|
| 系统工程师 | E6 | 网络同步、存储系统 | 项目包含联机功能 |
| 音效工程师 | E7 | 音效管理、BGM 切换 | 项目有音效需求 |

**为什么开发组最多人**：
- 代码是最大产出物（本次项目 7900 行），需要最多人力
- 单 Agent 超过 2000 行容易出现上下文溢出
- UI 页面之间高度独立，天然适合拆分并行

**组内协作规则**：
- E1 最先完成（纯数据无逻辑），其产出是 E2 的输入
- E2 和 E3/E4/E5 通过 `api-contracts.md` 解耦并行
- E3 先于 E4/E5 完成 UI 框架，E4/E5 基于框架开发页面
- 每个工程师只能写自己所有权范围内的文件

**开发顺序依赖图**：

```
          E1 (game_data)
              │
              ▼
    ┌─── E2 (state+logic) ───┐
    │                         │
    ▼                         ▼
E3 (ui框架)            (可并行等待)
    │
    ├──── E4 (复杂页面)
    └──── E5 (列表页面)
```

---

### 2.7 美术组（2 人）

| 角色 | 代号 | 技能领域 | 职责 | 产出物 |
|------|------|----------|------|--------|
| 视觉设计师 | A1 | 视觉规范 | 配色方案、字体层级、间距系统、组件样式规范 | `theme-spec.md` |
| 特效工程师 | A2 | 程序美术 | NanoVG 绘制方案、粒子效果、CustomGeometry、动画曲线 | `visual-assets.md`, `effects.lua` |

**启动时机**：
- A1 在 Phase 2 与 D1 并行启动（需要先确定美术风格才能指导 UI 开发）
- A2 在 Phase 4 与开发组并行启动（基于 A1 的视觉规范实现特效代码）

**裁剪条件**：纯文字游戏或极简 UI 可完全裁掉美术组，由 E3 兼任主题配色

---

### 2.8 QA 组（3 人）

测试工作覆盖三个不同维度：

| 角色 | 代号 | 测试维度 | 职责 | 产出物 |
|------|------|----------|------|--------|
| 逻辑 QA | Q1 | 正确性 | 核心逻辑验算、边界条件、状态机完整性、数值公式校验 | `qa-logic-report.md` |
| 交互 QA | Q2 | 功能性 | UI 交互流程、页面跳转、按钮响应、数据展示一致性 | `qa-interaction-report.md` |
| 体验 QA | Q3 | 体验性 | 游戏节奏、新手引导、信息层级、趣味性、沉浸感 | `qa-experience-report.md` |

**为什么需要 3 人**：
- Q1 关注"算对了没有" — 需要深入阅读 game_logic + game_state
- Q2 关注"做对了没有" — 需要深入阅读 ui_* 全部页面
- Q3 关注"好玩吗" — 需要从玩家视角整体评估，不深入代码细节

**组内协作流程**：

```
并行:
  Q1 → 读 game_data + game_state + game_logic + design-doc
       → 输出 qa-logic-report.md

  Q2 → 读 ui_main + ui_events + ui_tenants + ui_upgrades + api-contracts
       → 输出 qa-interaction-report.md

  Q3 → 读 design-doc + 整体代码结构
       → 输出 qa-experience-report.md

汇总:
  Orchestrator → 合并三份报告 → 按优先级排序 → Bug 列表
```

---

### 2.9 文件所有权矩阵

严格的文件所有权避免并行 Agent 写冲突：

```
scripts/
├── main.lua              → TR (审查员)
├── game_data.lua         → E1 (数据工程师)
├── game_state.lua        → E2 (逻辑工程师)
├── game_logic.lua        → E2 (逻辑工程师)
├── ui_main.lua           → E3 (UI框架工程师)
├── ui_utils.lua          → E3 (UI框架工程师)
├── ui_events.lua         → E4 (UI页面工程师A)
├── ui_tenants.lua        → E5 (UI页面工程师B)
├── ui_upgrades.lua       → E5 (UI页面工程师B)
├── net_*.lua             → E6 (系统工程师，可选)
├── audio.lua             → E7 (音效工程师，可选)
└── effects.lua           → A2 (特效工程师)

docs/
├── product/                  # 产品组产出
│   ├── market-research.md    → PM1 (产品经理)
│   └── product-brief.md      → PM2 (产品策略师)
├── design/
│   ├── mechanics-draft.md    → D1 (系统策划)
│   ├── numerical-draft.md    → D2 (数值策划)
│   ├── content-draft.md      → D3 (内容策划)
│   ├── design-review.md      → D4 (审查策划)
│   ├── design-doc.md         → D1 (最终合并)
│   └── theme-spec.md         → A1 (视觉设计师)
├── dev/
│   ├── architecture.md       → TL (架构师)
│   ├── api-contracts.md      → TL (架构师)
│   └── review-report.md      → TR (审查员)
└── qa/
    ├── qa-logic-report.md        → Q1 (逻辑QA)
    ├── qa-interaction-report.md  → Q2 (交互QA)
    └── qa-experience-report.md   → Q3 (体验QA)
```

---

### 2.10 团队规模一览

| 组别 | 人数 | 角色列表 | 核心理由 |
|------|------|----------|----------|
| 产品组 | 2 | PM1 产品经理 + PM2 产品策略师 | 市场调研和产品定位是策划的前置输入，避免闭门造车 |
| 策划组 | 4 | D1 系统 + D2 数值 + D3 内容 + D4 审查 | 机制/数值/内容是三个不同技能，审查需要局外人视角 |
| 架构组 | 2 | TL 架构 + TR 审查 | 设计和验证不应由同一人，TR 通读代码后最适合写整合入口 |
| 开发组 | 5~7 | E1 数据 + E2 逻辑 + E3 UI框架 + E4 UI页面A + E5 UI页面B + E6/E7 可选 | 按实测行数均匀分配，单 Agent 不超过 2500 行 |
| 美术组 | 0~2 | A1 视觉 + A2 特效 | 按项目美术需求裁剪 |
| QA 组 | 3 | Q1 逻辑 + Q2 交互 + Q3 体验 | 正确性/功能性/体验性三个独立维度 |
| **合计** | **16~20** | | |

---

## 3. 共享上下文系统 (Project Brain)

### 3.1 问题

每个 subagent 有独立的 200K 上下文窗口，无法直接读取其他 Agent 的工作记忆。如何让后续 Agent 了解前序 Agent 的决策？

### 3.2 解决方案：docs/ — 用户可见的工作空间

所有 Agent 的中间产出统一存放在 `docs/` 目录下，而非隐藏的 `.agent-workspace/`。这样设计的核心原因：

- **用户可随时审查**：策划文档、架构设计、QA 报告等全部对用户可见，用户发现问题可以及时介入更正
- **透明度**：用户能看到每个 Agent 产出了什么、质量如何，而不是等到最终交付才发现方向偏了
- **可干预**：用户可以直接修改 docs/ 下的文件（如调整设计文档、修正数值），Agent 下一轮会读取修改后的版本

```
docs/
├── project-brain.md          # 项目全局概要（Orchestrator 维护）
├── product/                  # 产品组产出
│   ├── market-research.md    # 竞品分析、用户画像、市场机会
│   └── product-brief.md      # 产品定位、MVP 清单、成功指标
├── design/                   # 策划组产出
│   ├── mechanics-draft.md
│   ├── numerical-draft.md
│   ├── content-draft.md
│   ├── design-review.md
│   ├── design-doc.md         # 最终设计文档（全团队可读）
│   └── theme-spec.md
├── dev/                      # 架构组产出
│   ├── architecture.md       # 架构文档（开发组必读）
│   ├── api-contracts.md      # API 契约（开发组的通信协议）
│   └── review-report.md      # 代码审查报告
├── qa/                       # QA 组产出
│   ├── qa-logic-report.md
│   ├── qa-interaction-report.md
│   └── qa-experience-report.md
├── delivery-report.md        # 最终交付报告（Orchestrator 生成）
└── changelog.md              # 变更记录（Orchestrator 追加）
```

### 3.3 project-brain.md 模板

```markdown
# Project Brain - {项目名}

## 基本信息
- 项目类型: {类型}
- 目标平台: UrhoX Web Preview
- 团队规模: {N} 人配置
- 当前阶段: Phase {N}
- 构建状态: {通过/失败/未验证}

## 关键决策记录
| 决策 | 原因 | 决策人 | Phase |
|------|------|--------|-------|
| ... | ... | ... | ... |

## 已知问题
| 问题 | 优先级 | 状态 | 负责人 |
|------|--------|------|--------|
| ... | P0-P3 | 待修/已修 | ... |

## 文件清单
| 文件 | 状态 | 负责人 | 行数 |
|------|------|--------|------|
| ... | 完成/进行中/待开始 | ... | ... |
```

### 3.4 Agent 上下文注入模板

Orchestrator 在启动每个 Agent 时，提供标准化的上下文注入：

```
你是 {角色名}（代号 {代号}），负责 {职责描述}。

必读文件：
- docs/project-brain.md（项目全局概要）
- {按角色列出的其他相关文件}

你的任务：
{具体任务描述}

你的产出：
- 写入 {目标文件路径}

约束：
- 只能写入你拥有的文件，禁止修改其他人的文件
- 遵循 api-contracts.md 中定义的接口
- 遵循 UrhoX 引擎规范（require 模式、事件系统等）
```

### 3.5 各角色必读文件索引

| 角色 | 必读文件 |
|------|----------|
| PM1 产品经理 | project-brain.md（联网搜索竞品信息） |
| PM2 产品策略师 | project-brain.md, market-research.md |
| D1 系统策划 | project-brain.md, product-brief.md |
| D2 数值策划 | project-brain.md, product-brief.md, mechanics-draft.md |
| D3 内容策划 | project-brain.md, product-brief.md, mechanics-draft.md, numerical-draft.md |
| D4 审查策划 | project-brain.md, product-brief.md, mechanics-draft.md, numerical-draft.md, content-draft.md |
| TL 架构师 | project-brain.md, product-brief.md, design-doc.md |
| TR 审查员 | project-brain.md, design-doc.md, architecture.md, api-contracts.md, 全部 scripts/*.lua |
| E1 数据 | design-doc.md, architecture.md, api-contracts.md |
| E2 逻辑 | design-doc.md, architecture.md, api-contracts.md, game_data.lua |
| E3 UI框架 | design-doc.md, architecture.md, api-contracts.md, theme-spec.md |
| E4/E5 UI页面 | design-doc.md, api-contracts.md, theme-spec.md, ui_main.lua, ui_utils.lua |
| A1 视觉 | project-brain.md, mechanics-draft.md |
| A2 特效 | theme-spec.md, architecture.md |
| Q1 逻辑QA | design-doc.md, game_data.lua, game_state.lua, game_logic.lua |
| Q2 交互QA | design-doc.md, api-contracts.md, ui_*.lua |
| Q3 体验QA | design-doc.md, 全部 scripts/*.lua（概览） |

### 3.6 文档大小控制与拆分策略

> **核心原则**：中间产出文档必须控制大小，过大的文档会降低 Agent 阅读效率、浪费 Token、增加理解偏差风险。

#### 文档大小阈值

| 文档类型 | 建议上限 | 超限处理 |
|----------|----------|----------|
| 策划文档（design-doc.md） | 15KB / 400行 | 按模块拆分为 `design-doc-core.md` + `design-doc-content.md` |
| API 契约（api-contracts.md） | 12KB / 300行 | 按模块组拆分为 `api-contracts-logic.md` + `api-contracts-ui.md` |
| 数值表（numerical-draft.md） | 10KB / 250行 | 数值公式和数据表分离，公式在文档、数据在代码 |
| QA 报告（qa-*.md） | 8KB / 200行 | 每份报告专注单一维度，不合并 |
| 审查报告（review-report.md） | 10KB / 250行 | 按文件组分批审查，每批独立报告 |
| 代码文件（*.lua） | 2500行 | 必须拆分模块（见规则 #13） |

#### 拆分触发规则

```
Orchestrator 在每次 Agent 产出后检查:
  if 文件大小 > 阈值:
    1. 识别文档中的独立章节/模块
    2. 按逻辑边界拆分为多个子文件
    3. 更新 project-brain.md 中的文件清单
    4. 调整后续 Agent 的必读文件列表（精确注入）

  拆分策略:
    策划文档 → 按"机制/数值/内容"三维度拆分
    API 契约 → 按"模块组"拆分（逻辑层 vs UI 层）
    代码文件 → 按"职责单一"原则拆分
```

#### Chain-of-Agents 模式（超大文档处理）

当单个文档超过 Agent 上下文窗口的有效处理范围（约 30KB）时，采用链式处理：

```
超大文档 → 分片 → Worker Agent 1 处理片段1 → 摘要1
                 → Worker Agent 2 处理片段2 → 摘要2
                 → Worker Agent 3 处理片段3 → 摘要3
                 → Manager Agent 合并摘要 → 最终产出
```

> **适用场景**：超大策划文档审查、全量代码审计、长文本内容校对。日常开发中通过控制文档大小可避免触发此模式。

---

## 4. 开发阶段与门禁

### 4.1 阶段总览

```
Phase 0 ──→ Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4 ──→ Phase 5 ──→ Phase 6
环境验证    市场调研    策划设计    架构设计    并行开发     整合验收     QA 测试
  │           │          │          │          │           │           │
  ▼           ▼          ▼          ▼          ▼           ▼           ▼
[BUILD]    [用户审]    [文档审]   [契约审]  [增量BUILD] [全量BUILD]  [预览测试]
                                                                       │
                                                                       ▼
                                                            ┌──── Phase 6b ────┐
                                                            │    Bug 修复      │
                                                            │  [增量 BUILD]    │
                                                            └──────────────────┘
                                                                       │
                                                                       ▼
                                                               交付用户审查
```

> 流程终止于"交付用户审查"。用户决定是否满意、是否需要迭代、是否发布。

---

### 4.2 Phase 0: 环境验证（最高优先级）

**目标**：确认构建工具和预览链路完整可用

**参与**：Orchestrator 直接执行（不启动 Agent）

**步骤**：
```lua
-- hello.lua (最小验证代码)
function Start()
    print("=== Hello UrhoX ===")
    graphics.windowTitle = "Build Test"
end

function HandleUpdate(eventType, eventData)
end
```

**执行**：
1. 将上述代码写入 `scripts/main.lua`
2. 调用 MCP build 工具构建
3. 等待构建完成
4. 确认预览页面可访问且标题显示 "Build Test"

**门禁**：
- [ ] build 工具可用且返回成功
- [ ] 预览页面可访问（无 CORS 错误）
- [ ] 游戏窗口标题显示正确
- [ ] **project-brain.md 已更新**（记录构建环境、工具版本、项目初始信息）

**失败处理**：Phase 0 不通过则 **停止一切后续工作**，向用户报告环境问题。

---

### 4.3 Phase 1: 市场调研与产品定位

**目标**：明确"做什么游戏、为谁做、核心卖点是什么"，为策划提供方向锚点

**参与 Agent**：PM1（产品经理）+ PM2（产品策略师）

**流程**：

```
Step 1:
  PM1 → 联网搜索同类游戏（用户指定的类型/方向）
       → 竞品分析、目标用户画像、市场机会
       → 输出 market-research.md

Step 2:
  PM2 → 读 market-research.md
       → 定义产品核心体验、MVP 功能清单、优先级排序、明确不做的功能
       → 输出 product-brief.md
```

**PM1 联网搜索要点**：
- 搜索 3~5 款同类型/同题材的代表性游戏
- 关注玩家评价中的"好评点"和"差评点"
- 搜索目标用户群体的偏好和痛点
- 如用户已有明确方向，围绕该方向做差异化调研

**门禁**：
- [ ] market-research.md 包含：至少 3 款竞品分析、用户画像、市场机会
- [ ] product-brief.md 包含：一句话定位、核心体验关键词、MVP 功能清单（P0/P1/P2）、明确不做的功能
- [ ] MVP 范围合理（P0 功能不超过 5 项，防止范围过大）
- [ ] **用户审查点**：通知用户 `docs/product/` 下文档已就绪，用户确认产品方向后才进入策划
- [ ] **project-brain.md 已更新**（记录产品定位、MVP 范围、关键决策）

**失败处理**：产品方向不明确或用户不认可则 **回到 Step 1**，根据用户反馈调整调研方向。

---

### 4.4 Phase 2: 策划设计

**参与 Agent**：D1 + D2 + D3 + D4（策划组全员），A1（视觉设计师，可选并行）

**输入**：`product-brief.md`（产品定位，策划组的方向锚点）

**流程**：

```
Step 1 (并行):
  D1 → 读 product-brief.md → mechanics-draft.md（核心机制框架，围绕 MVP 功能清单设计）
  D2 → 读 product-brief.md → numerical-draft.md（数值体系初稿，基于 D1 的机制假设）
  A1 → theme-spec.md（视觉风格方案，如有美术需求）

Step 2:
  D3 → 读 product-brief + mechanics + numerical → content-draft.md（内容填充）

Step 3:
  D4 → 读全部初稿 + product-brief → design-review.md（一致性审查 + 是否偏离 MVP 范围）

Step 4:
  D1 → 读 review + 全部初稿 → design-doc.md（最终合并版）
```

**门禁**：
- [ ] design-doc.md 包含：玩法概述、核心循环、数值公式表、完整内容清单
- [ ] D4 审查通过（无一致性矛盾，未超出 MVP 范围）
- [ ] Orchestrator 确认文档完整可交付给架构组
- [ ] **用户审查点**：通知用户 `docs/design/` 下文档已就绪，用户可审阅并提出修改意见
- [ ] **project-brain.md 已更新**（记录核心玩法、数值体系概要、内容规模）

---

### 4.5 Phase 3: 架构设计

**参与 Agent**：TL（架构师）

**输入**：`product-brief.md`, `design-doc.md`, `theme-spec.md`（如有）

**流程**：
```
Step 1: TL → 读 product-brief.md + design-doc.md，分析功能模块
Step 2: TL → 输出 architecture.md（模块拆分、依赖图、数据流、技术选型）
Step 3: TL → 输出 api-contracts.md（所有模块的每个公开函数签名）
```

**门禁**：
- [ ] architecture.md 包含：文件清单、依赖图、数据流图、技术选型理由
- [ ] api-contracts.md 包含：每个公开函数的签名（参数类型 + 返回值 + 说明）
- [ ] 文件所有权分配明确，无交叉
- [ ] 单人负责的代码量不超过 2500 行（否则需要拆分）
- [ ] **用户审查点**：通知用户 `docs/dev/architecture.md` 和 `api-contracts.md` 已就绪，用户可审阅技术方案
- [ ] **project-brain.md 已更新**（记录架构决策、文件清单、所有权分配、技术选型）

**api-contracts.md 格式要求**：
```markdown
## GameState API

### init()
- 参数: 无
- 返回: void
- 说明: 初始化游戏状态，加载存档

### getGold()
- 参数: 无
- 返回: number
- 说明: 返回当前金币数量
```

---

### 4.6 Phase 4: 并行开发 + 增量构建

**参与 Agent**：E1 ~ E5（开发组），A2（特效工程师，可选）

**输入**：`design-doc.md` + `architecture.md` + `api-contracts.md` + `theme-spec.md`

**流程**（按依赖顺序分批次）：

```
批次 1:
  E1 → game_data.lua（纯数据，无依赖）
  E3 → ui_utils.lua（UI 工具库，仅依赖 theme-spec）
  A2 → effects.lua（如有美术需求）

  完成后: Orchestrator → build → 验证

批次 2 (并行):
  E2 → game_state.lua + game_logic.lua（依赖 E1 的 game_data）
  E3 → ui_main.lua（UI 主框架，依赖 ui_utils）

  完成后: Orchestrator → build → 验证

批次 3 (并行):
  E4 → ui_events.lua（依赖 E3 的 ui_main + ui_utils）
  E5 → ui_tenants.lua + ui_upgrades.lua（同上）

  完成后: Orchestrator → build → 验证
```

**关键规则**：
- 每个批次完成后 Orchestrator **立即 build 验证**
- E2 和 E4/E5 **严格通过 api-contracts.md 解耦**，不读对方代码
- 如果某个 Agent 完成速度快，可以提前进入下一批次（但不能跳过 build）
- 如果 build 失败，定位到对应文件的 Owner 修复后重新 build

**嵌入式 QA（v5.0 新增）**🔴：每个批次 build 通过后，自动运行**快速通道**（LSP 诊断 + TRAP 扫描），将问题前移到开发阶段：

```
每个批次完成后:
  1. build
  2. 🏎️ 快速通道: LSP 诊断 + TRAP 扫描（5-10 秒，零额外成本）
     → 发现问题 → 立即反馈给当前批次的开发 Agent 修复
     → 全部通过 → 进入下一批次
  注: 此处不跑实机通道（节省时间），Phase 5 和 Phase 6a 会全量跑
```

**门禁**：
- [ ] 所有 .lua 文件语法正确
- [ ] 每个批次的增量 build 均通过
- [ ] 每个批次的 LSP 诊断 Error = 0（v5.0 新增）
- [ ] 模块间依赖关系与 architecture.md 一致
- [ ] **project-brain.md 已更新**（记录各批次完成状态、文件行数、已知问题）

---

### 4.7 Phase 5: 整合验收

**参与 Agent**：TR（审查员），TL（架构师，确认偏离度）

**流程**：

```
Step 1: TR → 通读所有 scripts/*.lua
Step 2: TR → 输出 review-report.md（代码审查报告）
Step 3: TR → 编写 main.lua（整合入口，串联所有模块）
Step 4: TL → 读 review-report.md → 确认架构偏离度
         → 如偏离严重：指派对应开发 Agent 修正
         → 如偏离可接受：通过
Step 5: Orchestrator → 全量 build
Step 6: Orchestrator → 预览验证（游戏能启动，基本流程可走通）
```

**review-report.md 标准格式**：
```markdown
## 审查概览
- 审查范围: scripts/*.lua（共 X 个文件，Y 行）
- 审查结论: 通过 / 有条件通过 / 不通过

## 问题清单
| # | 文件 | 行号 | 严重度 | 描述 | 建议修复 |
|---|------|------|--------|------|----------|
| 1 | game_logic.lua | 235 | 高 | ... | ... |

## 架构偏离评估
| 偏离点 | 影响范围 | 是否需要修正 |
|--------|----------|--------------|
| ... | ... | 是/否 |
```

**嵌入式 QA（v5.0 新增）**🔴：全量 build 通过后，自动运行**快速通道 + 实机通道**，在进入 Phase 6 之前前置发现运行时问题：

```
Step 5 全量 build 通过后:
  🏎️ 快速通道: LSP 全量诊断 + TRAP 扫描
  🎮 实机通道: screenshot-qa.js 截图 + 日志采集（模式 A）
     → 截图非黑屏 + 无 errors.log 错误 + 引擎事件正常 = 运行健康
     → 发现问题 → 立即反馈给 TR/开发 Agent 修复 → 重新 build + 验证
  注: 此处使用模式 A 快速检查即可，Phase 6a 可使用模式 B（Action Script）深度测试
```

**门禁**：
- [ ] main.lua 包含 Start() + HandleUpdate() + Stop()
- [ ] TR 审查报告中无"高严重度"问题（或已修复）
- [ ] TL 确认架构偏离可接受
- [ ] 全量 build 成功
- [ ] LSP 诊断 Error = 0（v5.0 新增）
- [ ] screenshot-qa.js 截图非黑屏、errors.log 无致命错误（v5.0 新增）
- [ ] 预览页面游戏正常启动，基本操作可走通
- [ ] **用户审查点**：通知用户预览已可用，`docs/dev/review-report.md` 已就绪，用户可体验并反馈
- [ ] **project-brain.md 已更新**（记录审查结论、架构偏离度、构建状态、预览状态）

---

### 4.8 Phase 6: QA 测试 + Bug 修复

**前置条件**：Phase 5 门禁全部通过（游戏可预览运行）

#### Phase 6a: 测试（静态分析 + 运行时验证）

> **v4.0 教训**：纯静态代码审查无法发现运行时问题。本框架第二次实战中，代码通过了 LSP 检查和 Code Review，但运行时仍出现 3 个 P0 级 Bug（模块引用错误、UI 布局流问题、布局溢出）。因此 QA 必须包含**运行时验证**维度。

**参与 Agent**：Q1 + Q2 + Q3（QA 组全员，并行）

**第零层：自动化检测**（Orchestrator 在启动 QA Agent 前自动执行）🔴 v5.0 架构升级

> 从 v4.3-v4.7 的 7 步串行模型升级为**通道模型**。按运行环境划分而非按检测能力分层。

```
自动化检测（QA Agent 启动前，Orchestrator 按通道执行）:

  🏎️ 快速通道（无需 build，5-10 秒）:
    ① LSP 工作区诊断 → lua_lsp_client diagnostic（Error 必须 = 0）（§12.1）
    ② 引擎陷阱扫描 → TRAP-001~008 模式匹配（§12.2）
    ③ API 契约验证 → workspace/symbol + references 交叉验证（§12.1）
    → 发现 Error → AI 自动修复（CAT-1/2）→ 重跑快速通道验证
    → 全部通过 → 进入实机通道

  🎮 实机通道（需要 build，30-60 秒）:
    ④ build → screenshot-qa.js 运行 → 一次采集五类数据（§12.4）
       截图 + 控制台日志 + JS/WASM 错误 + 引擎事件 + 交互结果
    → 发现问题 → AI 自动修复（CAT-3~6）→ build → 重跑实机通道验证
    → 全部通过 → 进入 QA Agent 静态分析

  ⚡ 可选加速器（复杂业务逻辑项目启用）:
    ⑤ Dry-Run 沙箱 → 可编程断言验证业务逻辑（§12.5）
    → 断言失败 → AI 修复（CAT-7）→ 重跑断言

  → 输出 docs/qa/auto-scan-report.md
  → 如有 Error 级问题经 AI 修复循环仍未解决，标记人工处理
  → AI 修复闭环详见 §12.6（CAT-1~7 分类、退出条件、SOP）
```

**第一层：静态分析**（Agent 可独立完成，在第零层通过后启动）

```
并行:
  Q1 → 读逻辑代码 + design-doc + auto-scan-report → qa-logic-report.md
  Q2 → 读 UI 代码 + api-contracts + auto-scan-report → qa-interaction-report.md
  Q3 → 读 design-doc + 整体代码 + auto-scan-report → qa-experience-report.md
```

**第二层：运行时验证清单**（Orchestrator 在 build 通过后执行）

QA Agent 的静态分析之外，Orchestrator 必须执行以下运行时验证：

```
运行时验证清单（Phase 6 门禁前必须逐项确认）：

  引擎 API 合规性:
    □ 所有 require() 调用引用的是可 require 的模块（非引擎内置全局变量）
    □ 引擎内置全局变量（cjson, vg, scene, renderer 等）未被 require
    □ UI 库 Widget 方法使用 PascalCase（AddChild, RemoveChild, SetVisible）
    □ 事件名拼写正确（NanoVGRender, Update, ScreenMode 等）
    □ eventData 访问方式正确（GetInt/GetFloat/GetString）

  页面/状态生命周期:
    □ 页面导航能正常切换（不出现空白页、重叠页）
    □ UI 隐藏机制正确（SetVisible 不影响布局流，需用 RemoveChild/AddChild）
    □ 返回/回退操作能正常恢复上一页面
    □ 游戏状态在页面切换后保持一致

  布局与渲染:
    □ 无 Layout Overflow 警告（检查 flexShrink 设置）
    □ NanoVG 渲染使用 NanoVGRender 事件（非 Update）
    □ 字体在 Start() 中创建（非每帧创建）
    □ 分辨率适配正确（DPR 处理）

  数据与存储:
    □ 本地存储使用 File API（非 io 库）
    □ JSON 编解码使用全局 cjson（非 require）
    □ 数组索引从 1 开始（非 0）
```

> **关键区别**：静态分析检查"代码写得对不对"，运行时验证检查"代码跑得对不对"。两者缺一不可。

**Bug 优先级定义**：

| 等级 | 定义 | 举例 |
|------|------|------|
| P0 | 崩溃/启动失败/数据丢失 | Start() 报错、存档损坏 |
| P1 | 核心功能错误 | 核心数值计算错误、事件不触发 |
| P2 | 次要功能问题 | UI 显示错位、文字截断 |
| P3 | 体验优化建议 | 节奏偏慢、缺少引导文案 |

#### Phase 6b: 修复

**参与 Agent**：根据 Bug 所属文件分配给对应 Owner

```
Orchestrator:
  1. 汇总三份 QA 报告 → 统一 Bug 列表
  2. 按优先级排序：P0 > P1 > P2（P3 记录但不阻塞）
  3. 按文件所有权分配 Bug 给对应开发 Agent
  4. 开发 Agent 修复 → Orchestrator build 验证
  5. 如修复引入新问题 → 回到步骤 4
  6. P0/P1 全部清零 → 进入交付
```

**门禁**：
- [ ] 自动化检测全部通过（LSP Error = 0、TRAP 扫描无 ❌、API 契约一致、Dry-Run 模块全通过）
- [ ] 无 P0 Bug
- [ ] 无 P1 Bug
- [ ] P2 Bug 尽量修复（允许遗留，记录在 project-brain.md）
- [ ] 修复后 build 成功
- [ ] 预览运行正常
- [ ] **用户审查点**：通知用户 `docs/qa/` 下三份 QA 报告已就绪，用户可查看测试覆盖和遗留问题
- [ ] **project-brain.md 已更新**（记录最终 Bug 清零状态、遗留问题、QA 评分）

---

### 4.9 交付用户审查

Phase 6 门禁通过后，Orchestrator **必须生成 `docs/delivery-report.md` 文件**，并向用户提交：

```
═══ 交付报告 ═══

项目: {项目名}
团队规模: {N} 人
Agent 调用总次数: {N} 次
代码总量: {N} 行 / {N} 个文件

构建状态: 通过
预览状态: 可正常运行

已实现功能:
  ✅ {功能1}
  ✅ {功能2}
  ...

已知遗留问题:
  - [P2] {描述}
  - [P3] {描述}

QA 评分:
  逻辑正确性: Q1 评分
  交互完整性: Q2 评分
  体验趣味性: Q3 评分

等待您的审查。您可以:
  1. 确认满意 → 结束
  2. 提出修改意见 → 进入迭代
  3. 要求补充功能 → 回到对应 Phase
═══════════════
```

> **决策权完全属于用户**。框架不假设"交付即完成"，用户随时可以要求回到任意 Phase 进行迭代。

---

## 5. 可视化与进度追踪

### 5.1 三层可观测性

| 层级 | 工具 | 受众 | 更新频率 |
|------|------|------|----------|
| 实时看板 | TodoWrite | 用户 | 每个 Agent 启动/完成时 |
| 阶段报告 | 文本输出 | 用户 | 每个 Phase 结束时 |
| 审计日志 | changelog.md | 回溯分析 | 每次文件变更时 |

### 5.2 TodoWrite 状态面板格式

```
Phase 0: 环境验证
  [x] 写 Hello World 脚本
  [x] 调用 build 工具
  [x] 确认预览正常

Phase 1: 市场调研与产品定位
  [x] PM1: 竞品调研 + 用户画像 → market-research.md
  [>] PM2: 产品定位 + MVP 清单 → product-brief.md
  [ ] 用户审查产品方向

Phase 2: 策划设计
  [ ] D1: 系统策划出稿
  [ ] D2: 数值策划出稿
  [ ] D3: 内容策划填充
  [ ] D4: 审查策划审查
  [ ] D1: 最终合并 design-doc.md

Phase 3: 架构设计
  [ ] TL: architecture.md
  [ ] TL: api-contracts.md

Phase 4: 并行开发
  [ ] 批次1: E1(数据) + E3(UI工具) → build
  [ ] 批次2: E2(逻辑) + E3(UI框架) → build
  [ ] 批次3: E4(复杂页面) + E5(列表页面) → build

Phase 5: 整合验收
  [ ] TR: 代码审查
  [ ] TR: 编写 main.lua
  [ ] TL: 架构偏离确认
  [ ] 全量 build + 预览验证

Phase 6: QA + 修复
  [ ] Q1: 逻辑测试
  [ ] Q2: 交互测试
  [ ] Q3: 体验测试
  [ ] Bug 修复 + 最终 build
```

### 5.3 阶段报告模板

每个 Phase 完成后，Orchestrator 输出结构化报告：

```
═══ Phase {N} 完成: {阶段名} ═══

参与 Agent: {列表}
Agent 调用次数: {N} 次

产出物:
  ✅ {文件名} ({大小})
  ✅ {文件名} ({大小})

门禁检查:
  ✅ {检查项1}
  ✅ {检查项2}
  ❌ {失败项} → {处理方案}

构建状态: ✅ 通过 / ❌ 失败 / ⬜ 无需构建
预览状态: ✅ 正常 / ❌ 异常 / ⬜ 无需预览

已知遗留问题:
  - {问题描述} (P{优先级})

下一步: Phase {N+1} - {阶段名}
═══════════════════════════════
```

### 5.4 开发日志（changelog.md）更新策略

`changelog.md` 是整个项目的审计日志和变更追溯依据，由 Orchestrator 独占写入，任何 Agent 不得修改。

#### 更新时机

| 触发事件 | 记录内容 | 优先级 |
|----------|----------|--------|
| Phase 门禁通过 | 阶段摘要、产出物清单、文件快照（文件名+大小+hash） | 必须 |
| 增量 build 通过 | 本批次涉及的文件、build 结果 | 必须 |
| 用户审查反馈 | 用户提出的修改意见原文、对应调整计划 | 必须 |
| Agent 重试/失败 | 失败原因、重试策略、最终结果 | 必须 |
| 关键决策变更 | 架构调整、需求变更、MVP 范围增减的原因和影响 | 必须 |
| Bug 发现与修复 | Bug 描述、优先级、修复文件、验证结果 | 建议 |
| 文件所有权变更 | 变更原因（如拆分模块、人员调整） | 建议 |

#### 日志条目格式

每条日志遵循统一格式，便于回溯和机器解析：

```markdown
### [{时间戳}] {事件类型} - {简要标题}

**Phase**: {当前阶段}
**触发者**: {Orchestrator / 用户 / Agent代号}
**事件类型**: {phase-gate / build / user-review / decision / bug-fix / retry}

**详情**:
{具体描述}

**影响文件**:
- {文件路径} ({操作: 新增/修改/删除}) - {大小} - hash: {hash}

**后续动作**:
- {下一步行动}
```

#### 完整示例

```markdown
# Changelog

### [Phase 0] phase-gate - 环境验证通过

**Phase**: 0
**触发者**: Orchestrator
**事件类型**: phase-gate

**详情**:
Hello World 脚本 build 成功，预览页面可正常访问，窗口标题显示正确。

**影响文件**:
- scripts/main.lua (新增) - 0.2KB - hash: a1b2c3

**后续动作**:
- 进入 Phase 1 市场调研

---

### [Phase 1] phase-gate - 市场调研与产品定位完成

**Phase**: 1
**触发者**: Orchestrator
**事件类型**: phase-gate

**详情**:
PM1 完成竞品调研（分析了 4 款同类游戏），PM2 输出产品定位文档。
MVP 定义 3 项 P0 功能、2 项 P1 功能。用户已确认产品方向。

**影响文件**:
- docs/product/market-research.md (新增) - 8KB - hash: d4e5f6
- docs/product/product-brief.md (新增) - 6KB - hash: g7h8i9

**后续动作**:
- 进入 Phase 2 策划设计，D1/D2 基于 product-brief.md 展开

---

### [Phase 4-批次2] build - 增量构建通过

**Phase**: 4
**触发者**: Orchestrator
**事件类型**: build

**详情**:
E2 完成 game_state.lua + game_logic.lua，E3 完成 ui_main.lua。
增量 build 通过，无语法错误。

**影响文件**:
- scripts/game_state.lua (新增) - 30KB - hash: j1k2l3
- scripts/game_logic.lua (新增) - 49KB - hash: m4n5o6
- scripts/ui_main.lua (新增) - 33KB - hash: p7q8r9

**后续动作**:
- 进入批次 3：E4 + E5 并行开发 UI 页面

---

### [Phase 4-批次2] user-review - 用户要求调整数值

**Phase**: 4
**触发者**: 用户
**事件类型**: user-review

**详情**:
用户审查 game_logic.lua 后提出：升级成本增长曲线过陡，
建议将指数系数从 1.8 调为 1.5。

**影响文件**:
- scripts/game_logic.lua (待修改)

**后续动作**:
- 指派 E2 修改 calculateUpgradeCost() 函数
- 修改后增量 build 验证

---

### [Phase 6] bug-fix - 修复金币溢出问题

**Phase**: 6
**触发者**: Q1 (逻辑QA)
**事件类型**: bug-fix

**详情**:
Q1 发现: 当金币超过 2^53 时出现精度丢失（P1）。
E2 修复: 改用字符串存储大数值 + 自定义运算函数。
修复后 build 通过，Q1 复测通过。

**影响文件**:
- scripts/game_state.lua (修改) - 32KB - hash: s1t2u3
- scripts/game_logic.lua (修改) - 50KB - hash: v4w5x6

**后续动作**:
- P1 Bug 清零，继续处理 P2 列表
```

#### 维护规则

1. **只追加不修改** — changelog 是审计日志，已写入的条目永远不删除、不编辑
2. **Orchestrator 独占写入** — 任何 Agent 不得直接写 changelog.md，信息由 Orchestrator 汇总后统一追加
3. **每次 build 必记录** — 无论成功或失败，build 结果都要记录（失败记录对排查问题至关重要）
4. **用户反馈原文保留** — 用户的审查意见按原文记录，不做删减或改写
5. **决策变更必须说明原因** — 任何偏离 product-brief 或 architecture 的决策，必须记录变更原因和影响评估

---

## 6. 错误恢复机制

### 6.1 常见错误与处理

| 错误场景 | 检测方式 | 恢复策略 |
|----------|----------|----------|
| build 工具不可用 | Phase 0 失败 | **停止一切**，向用户报告环境问题 |
| Agent 产出空文件 | Orchestrator 检查文件大小 | 重新启动该 Agent（附加更详细的指令） |
| Agent 产出与契约不符 | TR code review | 将契约文件 + 差异反馈给 Agent 重做 |
| 并行 Agent 写同一文件 | 文件所有权矩阵 | Orchestrator 仲裁，拒绝越界写入 |
| build 失败（语法错误）| build 工具报错 | 将错误信息传给对应文件的 Owner 修复 |
| 预览白屏 | 浏览器控制台错误 | 用户提供错误信息，Orchestrator 定位问题 |
| 单 Agent 代码量超限 | 文件行数检查 | 拆分为多个文件，分配给多个 Agent |

### 6.2 Agent 重试策略

```
Agent 失败时:
  第 1 次: 重启 Agent，附加更详细的指令 + 失败原因
  第 2 次: 启动新 Agent 修复（传入错误信息 + 原始产出）
  第 3 次: Orchestrator 亲自处理该任务
  第 4 次: 降级方案（简化该模块功能，减少复杂度）
```

### 6.3 回滚点

每个 Phase 通过门禁后，Orchestrator 在 changelog.md 中记录文件快照：

```markdown
## changelog.md

### Phase 1 通过
文件快照:
- market-research.md (8KB) - hash: aaa111
- product-brief.md (6KB) - hash: bbb222

### Phase 2 通过
文件快照:
- design-doc.md (12KB) - hash: abc123

### Phase 4 批次1 通过
文件快照:
- game_data.lua (65KB) - hash: def456
- ui_utils.lua (14KB) - hash: ghi789
构建状态: 通过

### Phase 4 批次2 通过
文件快照:
- game_state.lua (30KB) - hash: jkl012
- game_logic.lua (49KB) - hash: mno345
- ui_main.lua (33KB) - hash: pqr678
构建状态: 通过
```

如果后续 Phase 出现严重问题，可以定位到上一个门禁点的文件状态作为参考。

---

## 7. 项目规模适配

并非所有项目都需要 18 人团队。根据项目复杂度裁剪团队：

> **产品组不可裁剪**：无论项目大小，PM1（市场调研）始终保留。没有调研的策划是盲目的。小型项目可由 PM1 兼任 PM2。

### 7.1 小型项目（代码量 < 3000 行）

**团队**：6 人

```
产品组: PM1 (产品经理，兼产品策略)
策划组: D1 (策划，兼内容)
架构组: TL (架构 + 审查 + main.lua)
开发组: E1 (核心逻辑，含数据层) + E2 (UI 全部)
QA 组:  Q1 (QA，兼功能 + 体验)
```

**裁剪说明**：
- 产品组 2→1：PM1 兼任 PM2，输出精简版 product-brief
- 策划组 4→1：项目简单，一人可覆盖机制+内容
- 架构组 2→1：TL 兼任 TR 的审查职责
- 开发组 5→2：代码量少，每人约 1500 行可承受
- 美术组裁掉
- QA 组 3→1：单人全面测试

**产出物要求**（即使小型项目也必须生成）：
- `docs/dev/review-report.md` — TL 兼任 TR 的审查报告（可精简但不可省略）
- `docs/qa/qa-report.md` — Q1 的测试报告（可合并三维度为一份，但不可省略）
- `docs/delivery-report.md` — Orchestrator 的最终交付报告（独立文档，非口头汇报）

> **为什么小型项目也需要报告**：
> - 审查报告强制 Agent 系统性地检查代码，而非走马观花
> - QA 报告形成检查清单，避免遗漏运行时问题
> - 交付报告给用户完整的项目状态视图，便于后续迭代

**适用**：小型休闲游戏、Demo、单机制原型

---

### 7.2 中型项目（代码量 3000~8000 行）

**团队**：12 人

```
产品组: PM1 (产品经理) + PM2 (产品策略师)
策划组: D1 (系统) + D2 (数值+审查) + D3 (内容)
架构组: TL (架构) + TR (审查+整合)
开发组: E1 (数据) + E2 (逻辑) + E3 (UI框架+工具) + E4 (UI页面)
QA 组:  Q1 (逻辑+交互) + Q2 (体验)
```

**裁剪说明**：
- 产品组完整保留（2 人）
- 策划组 4→3：D2 兼任 D4 的审查职责
- 开发组 5→4：E4 兼任 E5（页面量可控时）
- 美术组裁掉（或 A1 与 D1 并行启动出 theme-spec）
- QA 组 3→2：Q1 兼任交互测试

**适用**：经营游戏、卡牌游戏、文字冒险、中等复杂度 2D 游戏

---

### 7.3 大型项目（代码量 > 8000 行）

**团队**：16~20 人（完整配置）

```
产品组: PM1 + PM2
策划组: D1 + D2 + D3 + D4
架构组: TL + TR
开发组: E1 + E2 + E3 + E4 + E5 (+ E6/E7 可选)
美术组: A1 + A2
QA 组:  Q1 + Q2 + Q3
```

**适用**：3D 游戏、多人联机游戏、复杂 RPG、大型模拟经营

---

### 7.4 规模选择速查表

| 指标 | 小型 (6人) | 中型 (12人) | 大型 (16~20人) |
|------|-----------|------------|----------------|
| 预计代码行数 | < 3000 | 3000~8000 | > 8000 |
| 预计文件数 | 3~5 | 6~12 | 12+ |
| 游戏核心机制数 | 1~2 | 3~5 | 5+ |
| UI 页面/标签数 | 1~2 | 3~5 | 5+ |
| 数值公式复杂度 | 简单 | 中等 | 复杂（需专人建模） |
| 文案/剧情量 | 少量 | 中量 | 大量（需专人创作） |
| 是否需要联机 | 否 | 可选 | 大概率是 |
| 是否需要特效 | 否 | 可选 | 是 |
| 预计 Agent 调用次数 | 10~14 | 18~28 | 28~45 |

---

## 8. 附录：经验教训

### 8.1 首次实战项目复盘

**项目概况**：
- 类型：文字经营游戏
- 团队：7 人配置（中型）
- 代码量：9 个文件，7903 行，约 280KB
- 结果：代码完成但因 build 工具缺失无法预览

**做对了什么**：
1. Project Brain 文件共享机制有效，Agent 间上下文传递流畅
2. api-contracts.md 让核心开发和 UI 开发成功并行无冲突
3. 同岗位配对审查（策划互审）显著提升了设计质量
4. QA 组发现了 6 个真实 Bug，其中 5 个 P0/P1 被修复

**做错了什么**：
1. **没有市场调研** — 直接凭感觉开始策划，缺少竞品分析和产品定位，策划方向无锚点
2. **Phase 0 缺失** — 没有验证 build 工具可用性，导致整个项目无法交付
3. **构建不增量** — 写完所有代码才第一次尝试 build
4. **手动写 dist/** — 绕过官方 build 工具，导致 CORS 问题
5. **QA 在不可运行状态下测试** — 只能做静态代码审查，无法验证运行时行为
6. **UI 工作量低估** — 4110 行 UI 代码交给 1 个 Agent，接近上下文极限
7. **策划组缺乏数值专人** — 数值设计和内容创作混在一起，效率低

**工作量实测数据**：

| 归属 | 文件 | 行数 | 占比 |
|------|------|------|------|
| 核心开发 | game_data + game_state + game_logic | 3678 行 | 47% |
| UI 开发 | ui_main + ui_utils + ui_events + ui_tenants + ui_upgrades | 4110 行 | 52% |
| 整合 | main.lua | 115 行 | 1% |

### 8.1b 第二次实战项目复盘

**项目概况**：
- 类型：竖屏人生模拟/选择游戏
- 团队：6 人配置（小型）
- 代码量：多文件模块化架构，约 1500 行
- 结果：构建成功，但运行时发现 3 个 P0 Bug

**做对了什么**：
1. 从 Phase 0 开始严格执行，构建链路验证无问题
2. 模块化架构设计合理（PageManager 栈式页面管理、事件系统解耦）
3. 增量构建验证贯穿开发过程

**做错了什么（暴露的流程缺陷）**：
1. **QA 只做了静态代码审查** — LSP 检查通过 + Code Review 通过，但运行时 3 个 P0 Bug 全部漏检
2. **project-brain.md 更新不及时** — 多个 Phase 门禁没有强制检查 project-brain 更新
3. **小型项目省略了正式报告** — 没有独立的审查报告、QA 报告、交付报告文档，审查质量下降
4. **引擎特有陷阱未形成检查清单** — `require` 内置全局变量、`SetVisible` 不影响布局等问题应纳入标准检查

**运行时 Bug 清单（全部 P0）**：

| Bug | 根因 | 检测手段 | 为什么静态审查漏掉了 |
|-----|------|----------|---------------------|
| `Module not found: cjson` 启动崩溃 | 对引擎内置全局变量使用了 `require()` | 运行时日志 | LSP 不检查 require 的目标是否存在；Code Review 认为 require 是常规操作 |
| 点击"开始游戏"页面空白 | `SetVisible(false)` 不影响 Yoga 布局流，隐藏页面仍占空间 | 运行时交互 | 需要深入理解 UI 库实现才能发现；静态代码看不出布局问题 |
| 按钮布局溢出 2px | Emoji 文本渲染宽度超过容器，缺少 `flexShrink` | 运行时控制台警告 | 文本渲染宽度只有运行时才知道 |

**核心教训**：
> **构建通过 ≠ 运行正确**。静态分析（LSP + Code Review）只能发现语法和类型错误，无法发现语义错误和运行时行为问题。QA 流程必须包含运行时验证清单。

### 8.1c 第三次实战：QA 工具链进化复盘

**项目概况**：
- 类型：同一款人生模拟器项目的持续迭代
- 焦点：从"发现 Bug"到"自动发现并修复 Bug"的 QA 能力跃迁
- 结果：QA 工具链从 BLOCKED 状态进化为完整的**两条通道 + 可选加速器**架构

**做对了什么**：
1. **解决了 Puppeteer 环境阻塞** — 通过 `setup.sh` 从 Chromium 提取 `.so` 库到用户空间 `~/.local/lib/`，无需 sudo 即可在无 GPU 沙箱中运行 SwiftShader 软件渲染
2. **重新定义了 QA 架构** — 从 6 层串行架构（层层依赖）进化为**两条通道并行**（快速通道 + 实机通道），消除了"L3 被阻塞导致 L4-L6 全废"的瀑布式失败
3. **构建了 screenshot-qa.js 统一检测源** — 567 行自动化玩家，一次运行产出 5 类数据（截图 + 控制台日志 + JS/WASM 错误 + 引擎事件 + 交互结果），16 种 Action Script 操作类型
4. **将 QA 检查嵌入开发流程** — Phase 4 每批次构建后自动跑快速通道，Phase 5 全量构建后跑双通道，不再把 QA 推迟到 Phase 6a

**关键架构决策及理由**：

| 决策 | 旧方案 | 新方案 | 理由 |
|------|--------|--------|------|
| QA 组织方式 | 6 层串行（L1→L6） | 两条通道并行 | 串行架构一层阻塞则后续全废；通道间独立运行，快速通道永远可用 |
| Puppeteer 定位 | 仅截图（L3，BLOCKED） | 统一检测源（16 种交互） | 一次运行 = 截图 + 日志 + 错误 + 事件 + 交互，不只是"看一眼" |
| Dry-Run 沙箱 | 核心层（L2） | 可选加速器 | Dry-Run 唯一不可替代价值是可编程断言，其余检测能力被 LSP 和 Puppeteer 覆盖 |
| QA 执行时机 | Phase 6a 集中执行 | Phase 4/5 嵌入 + Phase 6a 兜底 | 越早发现越便宜，构建通过 ≠ 运行正确（§8.1b 教训的延伸） |

**核心教训**：
> **不是层，是通道**。QA 工具应按运行环境（文本分析 vs 真实引擎）而非检测能力级别组织。两条独立通道确保任何一条出问题时，另一条仍能提供基本保障。
>
> **BLOCKED 不是终点**。环境限制（无 sudo、无 GPU）看似不可逾越，但通过用户空间库提取 + SwiftShader 软件渲染，可以在任何环境中运行 Puppeteer。解决工具链问题的投入，远小于每次手动验证的累积成本。

### 8.2 关键反模式（Anti-Patterns）

| 反模式 | 后果 | 正确做法 |
|--------|------|----------|
| 跳过 Phase 0 | 全部白做 | 先用 10 行代码验证工具链 |
| 跳过市场调研 | 闭门造车，方向偏移 | Phase 1 先做竞品分析和产品定位 |
| 手动写 dist/ | CORS 错误 | 只用官方 build 工具 |
| 攒到最后才 build | 错误堆积难定位 | 每批次完成就 build |
| 不声明文件所有权 | 并行写冲突 | 严格文件边界矩阵 |
| 口头传递上下文 | Agent 遗忘 | 一切写入共享文件 |
| 不可运行时做 QA | QA 只能看代码 | 可预览状态下做 QA |
| 一个策划包办所有 | 设计有盲区 | 按技能领域拆分 |
| 单 Agent 写 4000+ 行 | 上下文溢出 | 单人不超过 2500 行 |
| 流程中包含"发布" | 越权决策 | 交付用户审查，由用户决定 |
| 策划没有产品方向锚点 | 功能蔓延、需求摇摆 | 策划必须基于 product-brief.md 展开 |
| require 引擎内置全局变量 | 运行时 Module not found 崩溃 | cjson/vg 等全局变量直接使用，不 require |
| 用 SetVisible 控制页面显隐 | 隐藏页面仍占布局空间，新页面被挤出可视区域 | 用 RemoveChild/AddChild 从布局树摘除/恢复 |
| QA 只做静态代码审查 | 运行时 Bug 全部漏检（本次项目 3 个 P0） | 静态分析 + 运行时验证清单双重检查 |
| 不更新 project-brain.md | 后续 Phase 缺少上下文，决策无记录 | 每个 Phase 门禁强制更新 |
| 小型项目省略报告文档 | 审查流于形式，问题无追溯 | 任何规模都必须生成审查报告、QA 报告、交付报告 |

### 8.3 Orchestrator 操作检查清单

每次启动项目时，Orchestrator 应按此清单操作：

```
项目启动:
  □ 创建 docs/ 目录结构（含 product/, design/, dev/, qa/）
  □ 创建 project-brain.md
  □ 执行 Phase 0（Hello World + build + 预览）
  □ Phase 0 通过后才继续
  □ 执行 Phase 1（PM1 市场调研 → PM2 产品定位）
  □ 用户确认产品方向后才进入策划

每个 Phase 开始前:
  □ 更新 TodoWrite 状态面板
  □ 确认输入文件已就绪
  □ 准备 Agent 上下文注入内容

每个 Agent 启动时:
  □ 明确角色、职责、必读文件、产出文件
  □ 声明文件所有权边界

每个 Agent 完成后:
  □ 检查产出物非空且格式正确
  □ 更新 TodoWrite
  □ 如涉及代码变更 → 触发增量 build

每个 Phase 完成后:
  □ 执行门禁检查（所有条目通过才放行）
  □ 输出阶段报告
  □ 记录 changelog
  □ **强制更新 project-brain.md**（门禁必检项，缺失则不放行）
  □ 通知用户本阶段 docs/ 下的新增/更新文件，等待用户确认或修改意见
  □ 如用户提出修改 → 执行修改后重新过门禁

交付时:
  □ 输出最终交付报告
  □ 列出已知遗留问题
  □ 等待用户审查和决策
```

---

---

## 9. 平台概况：TapTap 制造

### 9.1 平台定位

TapTap 制造是 TapTap 推出的 **AI 原生（AI-Native）** 游戏创作平台，采用"**AI 智能体 + AI Native 引擎 + TDS**"三位一体架构，允许用户通过自然语言描述来生成和开发游戏。底层引擎为 UrhoX，使用 Lua 5.4 作为脚本语言，目标是让"想到就能做到"。

**架构特点**：
- **纯代码驱动**：没有可视化编辑器，所有游戏逻辑通过 Lua 代码表达，天然适合 AI 生成和修改
- **AI 智能体深度集成**：AI 不是辅助工具，而是核心生产力——从策划到编码到测试全链路参与
- **TDS 云服务支撑**：云变量、排行榜、多人联机等基础设施开箱即用，减少 Agent 需要编写的基础代码量
- **即时构建预览**：修改 → build → 预览的循环以秒计，适合 Agent 增量验证

### 9.2 核心优势

| 优势 | 说明 |
|------|------|
| **零代码起步** | 通过自然语言描述即可生成基础游戏原型，适合非程序员用户 |
| **AI 辅助编码** | 内置 AI 编程助手，可以根据需求生成、修改 Lua 代码 |
| **即时预览** | 修改后通过 build 工具可立即在 Web 端预览效果，开发-验证循环短 |
| **丰富引擎能力** | 底层 UrhoX 支持 2D/3D 渲染、Box2D 物理、NanoVG 绘图、Yoga Flexbox 布局等 |
| **社区生态** | TapTap 平台自带用户社区，便于分享和获得反馈 |
| **移动端适配** | 面向移动端设计，天然适配手机屏幕和触控操作 |

### 9.3 已知限制与注意事项

| 限制 | 应对策略 |
|------|----------|
| **构建工具依赖** | 必须通过官方 build 工具构建，手动写 dist/ 会导致 CORS 等问题 |
| **Lua 生态有限** | 相比 Unity/C#、Godot/GDScript，Lua 第三方库较少，需更多自行实现 |
| **调试手段有限** | 主要依赖 `print()` 输出日志调试，缺少断点、变量监视等 IDE 功能 |
| **单入口结构** | 所有代码最终打包为单个 main.lua，大型项目需注意模块化管理 |
| **AI 上下文限制** | 单次 AI 交互有 Token 上限，超大型项目需拆分多轮对话 |

### 9.4 社区开发者经验摘要

来自 TapTap 社区和开发者论坛的实践经验：

**项目规划建议**：
- 开发前先明确游戏核心玩法，用 1~2 句话能说清楚的才适合一个项目周期
- 先做最小可玩版本（MVP），验证核心乐趣后再逐步扩展
- 复杂机制拆成小模块逐个实现和测试，避免一次写太多

**UI 开发要点**：
- 移动端 UI 要考虑手指操作区域，按钮尺寸不宜过小
- 文字层级要清晰：标题 > 主要信息 > 次要信息 > 提示文本
- 滑动列表和弹窗是最常见的交互模式，优先掌握

**性能与调试**：
- 首次交付代码时大量使用 `print()` 日志，确认功能正常后再删除
- NanoVG 绘图要注意每帧重绘的性能消耗，避免在 `HandleUpdate` 中做复杂运算
- 注意 Lua 数组从 1 开始，这是新手最常见的 bug 来源之一

### 9.5 多 Agent 协作与 TapTap 制造的适配要点

基于框架实战和平台特性，以下是多 Agent 在 TapTap 制造环境下的特有注意事项：

| 要点 | 说明 | 落地建议 |
|------|------|----------|
| **引擎内置全局变量清单** | `cjson`, `vg`, `scene`, `renderer`, `graphics`, `input`, `cache`, `ui`, `fileSystem` 等为引擎自动注入的全局变量，**不可 require** | 纳入运行时验证清单（Phase 6a），每次 QA 必查 |
| **UI 库方法命名** | UrhoX UI 库使用 PascalCase（`AddChild`, `SetVisible`），非 camelCase | Code Review 检查项 |
| **NanoVG 是 Canvas 替代** | 用户说"Canvas"时，使用 NanoVG 实现；渲染必须在 `NanoVGRender` 事件中 | Agent 系统提示中固化 |
| **build 工具是唯一构建方式** | 禁止手动写 dist/、禁止 npm/webpack 等前端工具链 | Phase 0 验证链路时确认 |
| **移动端优先** | 默认面向手机屏幕和触控操作，按钮最小 44×44 逻辑像素 | 美术规范（theme-spec.md）中明确 |
| **文件路径约定** | `scripts/` 和 `assets/` 是资源根目录，引用时不加目录前缀 | 纳入 Agent 上下文注入模板 |

**Agent 调用最佳实践（TapTap 制造特化）**：

```
系统提示优化:
  1. 将引擎全局变量清单放入固定前缀（触发 Prompt 缓存）
  2. 将 UrhoX 代码约定（require 规则、事件系统、数组索引）固化
  3. 将运行时验证清单作为 QA Agent 的标准输入

增量开发优化:
  1. 每批次开发完成后立即 build（验证语法）
  2. build 成功后 Orchestrator 快速检查运行时验证清单中的"引擎 API 合规性"项
  3. 发现问题立即反馈给 Owner 修复，不等到 Phase 6
```

---

## 10. 可用工具与能力

### 10.1 工具总览

在多 Agent 协作中，以下工具可大幅提升效率和质量：

| 工具类型 | 工具名 | 用途 | 使用场景 |
|----------|--------|------|----------|
| **构建工具** | MCP build | 编译打包 Lua 项目，注册预览服务 | 每次代码变更后必须调用 |
| **Lua LSP** 🔴 | lua_lsp_client | 全协议 LSP：诊断、符号查找、引用追踪、类型悬停 | QA 快速通道核心（见 §12.1） |
| **Puppeteer 自动化玩家** 🔴 | screenshot-qa.js | Headless Chrome 截图 + 日志 + 错误 + 交互，一次运行产出五类数据 | QA 实机通道核心（见 §12.4） |
| **真机反馈** 🔴 | get_debug_feedbacks | 拉取真机测试截图 + 运行日志到本地 | Phase 6 真机 QA 闭环（见 §12.3） |
| **测试二维码** | generate_test_qrcode | 生成手机扫码测试链接 | Phase 5/6 真机测试 |
| **联网搜索** | WebSearch | 搜索最新技术资料、解决方案、社区经验 | 策划灵感、技术选型、Bug 排查 |
| **版本管理** | Git | 代码版本控制、回滚、分支管理 | 全流程使用 |
| **文件探索** | Explore Agent | 快速搜索代码库中的文件和模式 | 代码审查、定位问题 |
| **任务管理** | TodoWrite | 实时追踪多 Agent 进度 | Orchestrator 全程使用 |

> 🔴 **v5.0 工具链升级**：Puppeteer + SwiftShader 已在无 GPU 沙箱中可用（通过 `setup.sh` 用户空间安装系统库），与 LSP 共同构成"两条通道"QA 架构（详见 §12）。
> - **环境安装**：首次使用前运行 `bash test/qa-tools/setup.sh`（一键安装，约 2 分钟）
> - **快速通道**（LSP）：纯文本分析，5-10 秒，无需 build
> - **实机通道**（Puppeteer）：真实引擎渲染 + 交互，30-60 秒，需要 build

### 10.2 联网搜索的最佳实践

AI Agent 具备联网搜索能力，可在以下场景中发挥关键作用：

**适合搜索的场景**：
- 策划阶段调研同类游戏的机制设计，获取灵感
- 遇到引擎 API 不确定的用法时，搜索文档和社区解答
- 排查疑难 Bug 时，搜索他人遇到的类似问题和解决方案
- 了解特定算法或设计模式的最佳实践

**搜索技巧**：
- 使用具体关键词而非模糊描述（如 "Lua table sort by field" 而非 "Lua排序"）
- 加上年份限定获取最新信息（如 "UrhoX NanoVG 2026"）
- 搜索英文资料通常覆盖面更广，搜索中文资料更贴近国内社区经验

**注意事项**：
- 搜索结果需要人工判断适用性，不可盲目照搬
- 搜索会消耗额外时间和 Token，应在确实需要外部信息时才使用
- 引擎内部文档优先于外部搜索结果

### 10.3 Git 版本管理集成

Git 是多 Agent 协作中不可或缺的安全网。推荐如下集成方式：

#### 工作流

```
Phase 0 通过后:
  git init
  git add -A
  git commit -m "feat: Phase 0 环境验证通过"

每个 Phase 门禁通过后:
  git add -A
  git commit -m "feat: Phase {N} {阶段名}完成"

每个开发批次 build 通过后:
  git add -A
  git commit -m "feat: 批次{N} {模块名} 开发完成"

Bug 修复后:
  git add -A
  git commit -m "fix: {bug描述}"
```

#### 提交规范（Conventional Commits）

| 前缀 | 用途 | 示例 |
|------|------|------|
| `feat:` | 新功能/新阶段完成 | `feat: Phase 2 策划设计完成` |
| `fix:` | Bug 修复 | `fix: 金币计算溢出问题` |
| `docs:` | 文档变更 | `docs: 更新 design-doc.md 数值公式` |
| `refactor:` | 代码重构 | `refactor: 拆分 game_logic 为两个模块` |
| `test:` | 测试相关 | `test: 添加边界条件测试用例` |

#### 分支策略

```
main             ← 始终保持可 build 通过的代码
 └─ dev          ← 主开发分支
    ├─ feat/ui   ← 大型 UI 改动（可选）
    └─ fix/xxx   ← Bug 修复分支（可选）
```

对于大多数项目，在 `main` 分支上线性提交即可。只有在需要同时进行多条独立改动线且可能互相冲突时，才引入分支。

#### Git 在多 Agent 中的核心价值

1. **回滚能力**：某个 Agent 改坏了代码，可以快速回退到上一个已验证的提交
2. **变更追踪**：清楚知道每个文件在哪个 Phase 被谁修改过
3. **冲突检测**：如果两个 Agent 意外修改了同一文件，git 会报告冲突
4. **安全实验**：可以在分支上做实验性改动，失败了直接丢弃

#### Git 使用注意事项

- 提交信息应记录意图而非仅描述改动（如 "修复连续点击导致金币翻倍" 而非 "修改 game_logic.lua"）
- AI 生成的提交信息需要审核，确保准确反映变更内容
- 每次 build 通过是一个自然的提交点
- `docs/` 目录下的文档变更也应纳入版本管理

---

## 11. Token 优化与成本控制

### 11.1 为什么 Token 优化很重要

多 Agent 协作中，Token 消耗是最主要的成本来源。一个 16 人团队全流程运行下来，每个 Agent 都有独立的 200K 上下文窗口，如果不加控制，Token 消耗会非常可观。

**Token 成本的主要来源**：
- 长系统提示（System Prompt）重复传入每个 Agent
- Agent 读取大量文件内容到上下文
- 失败重试导致的重复消耗
- 上下文窗口随对话轮次膨胀

> **关于模型选择**：核心创造性任务（策划、架构、编码、审查）应使用最高级模型以保证质量。但对于结构化、重复性任务（数据填充、格式检查、日志整理），可使用轻量模型以提升速度和降低成本。详见 11.5.2 智能模型路由。Token 优化的首要策略仍是"减少不必要的输入"，模型降级仅作为特定场景的补充手段。

### 11.2 核心优化策略

#### 策略 1：精确的上下文注入（角色过滤）

不给 Agent 不需要的信息。每个 Agent 只读取与其角色相关的文件。

```
❌ 反模式: 将全部 docs/ 和 scripts/ 传给每个 Agent
✅ 正确做法: 参照 3.5 节"各角色必读文件索引"，精确注入

示例对比:
  E5 (UI页面工程师B) 需要读:
    ✅ design-doc.md, api-contracts.md, theme-spec.md, ui_main.lua, ui_utils.lua
    ❌ 不需要: game_logic.lua, game_state.lua, qa-*.md, mechanics-draft.md
```

**节省幅度**：减少 30~50% 的输入 Token。

#### 策略 2：文件摘要而非全文

对于大文件，Agent 不需要读取全文。Orchestrator 可以预生成摘要。

```
场景: Q3 (体验QA) 需要了解全部代码的大致结构

❌ 传入全部 7900 行代码
✅ 传入 Orchestrator 生成的代码结构摘要:
    "game_data.lua (1262行): 定义游戏全部数据表...
     game_state.lua (967行): 状态管理模块...
     ui_main.lua (1019行): 主界面框架..."
```

**节省幅度**：对于只需概览而非深入阅读的场景，节省 60~80% Token。

#### 策略 3：增量传递而非全量重传

Phase 之间传递信息时，只传递变更部分。

```
Phase 6b (Bug修复):
  ❌ 将全部 QA 报告 + 全部代码传给修复 Agent
  ✅ 只传给 E2: "game_logic.lua 第235行存在数值溢出，详见 qa-logic-report.md 第3条"
```

#### 策略 4：减少失败重试

失败重试是最大的 Token 浪费。通过以下方式降低失败率：

| 措施 | 效果 |
|------|------|
| Phase 0 环境验证 | 避免后续全部白做 |
| api-contracts.md 明确接口 | 减少 Agent 猜测和理解偏差 |
| 文件所有权矩阵 | 消除并行写冲突 |
| 每批次增量 build | 尽早发现问题，减少返工范围 |
| 标准化上下文注入模板 | 降低 Agent 误解任务的概率 |

#### 策略 5：复用共享文件避免重复生成

同一信息只生成一次，多次引用。

```
design-doc.md 由 D1 生成一次 → E1~E5 共享读取
api-contracts.md 由 TL 生成一次 → E1~E5 + TR + Q2 共享读取
theme-spec.md 由 A1 生成一次 → E3~E5 + A2 共享读取
```

这就是 Project Brain 架构的核心价值——**写一次，读多次**。

### 11.3 Token 预算规划

为项目制定 Token 预算有助于控制成本：

| 阶段 | Agent 数 | 平均输入 Token | 平均输出 Token | 预估总消耗 |
|------|----------|---------------|---------------|-----------|
| Phase 0 环境验证 | 0 (Orchestrator) | - | ~500 | ~500 |
| Phase 1 市场调研 | 2 | ~5K | ~12K | ~34K |
| Phase 2 策划设计 | 4 | ~8K | ~15K | ~92K |
| Phase 3 架构设计 | 1 | ~20K | ~15K | ~35K |
| Phase 4 并行开发 | 5 × 3批 | ~15K | ~25K | ~600K |
| Phase 5 整合验收 | 2 | ~30K | ~20K | ~100K |
| Phase 6 QA+修复 | 3+修复 | ~20K | ~10K | ~150K |
| **合计** | | | | **~1M Token** |

> 注：以上为中型项目（~8000 行代码）的粗略估算。实际消耗取决于重试次数、代码复杂度等因素。

### 11.4 成本优化检查清单

Orchestrator 在每个 Phase 执行前应检查：

```
Token 优化检查:
  □ 是否只给 Agent 传入了必要的文件？（参照 3.5 节文件索引）
  □ 大文件是否可以用摘要替代全文？
  □ 该 Agent 是否需要高级模型？还是标准模型即可？
  □ 上一次失败的原因是否已解决？（避免相同原因重试）
  □ 是否有可以并行的 Agent？（减少总轮次）
  □ 任务描述是否足够明确？（减少误解导致的重试）
```

### 11.5 链路效率优化

> **目标**：在保证质量的前提下，最大化缩短从"用户提出需求"到"可游玩交付"的端到端时间。

#### 11.5.1 并行执行最大化

**原则**：依赖图中无数据依赖的 Agent 必须并行启动，不得串行等待。

```
Phase 2 并行机会:
  ✅ D1 + D2 + A1 可并行（各自独立读 product-brief）
  ❌ D3 必须等 D1+D2（需要读 mechanics + numerical）

Phase 4 并行机会:
  ✅ E1 + E3 + A2 可并行（无数据依赖）
  ✅ E4 + E5 可并行（相同输入依赖）
  ❌ E2 必须等 E1（需要 game_data）

Phase 6a 并行机会:
  ✅ Q1 + Q2 + Q3 全部并行（各自读不同文件）
```

**并行执行收益**：根据研究数据，充分并行可带来 **~36% 的总时间缩短**。

**实践要求**：Orchestrator 在启动每批 Agent 时，必须使用**单条消息包含多个 Task Tool 调用**（而非逐个串行调用）。

#### 11.5.2 智能模型路由

> **v4.1 更新**：修正"全员统一模型"的绝对化表述。对于**非创造性、非推理密集型**任务，可以使用更快更轻的模型以提升效率。

| 任务类型 | 推荐模型层级 | 理由 |
|----------|-------------|------|
| Orchestrator 编排决策 | 最高级 | 需要全局推理和多步规划 |
| 策划设计（D1-D4） | 最高级 | 需要创造力和系统性思维 |
| 架构设计（TL） | 最高级 | 需要技术判断力 |
| 代码开发（E1-E5） | 最高级 | 需要精确编码能力 |
| 代码审查（TR） | 最高级 | 需要理解代码语义 |
| **数据填充（E1 纯数据表）** | **中级可选** | 结构化重复工作，模板明确 |
| **文件格式检查** | **轻量级可选** | 纯规则匹配，无需推理 |
| **日志/报告格式化** | **轻量级可选** | 模板填充，无创造性需求 |

**节省幅度**：对可降级任务使用轻量模型，可节省 **30~50% Token 成本**，同时因模型更快而缩短等待时间。

#### 11.5.3 上下文复用与缓存

**Prompt 缓存策略**：

| 缓存对象 | 方法 | 收益 |
|----------|------|------|
| 引擎规则/约束 | 固定在 System Prompt 前缀 | 90% 输入成本降低（相同前缀命中缓存） |
| api-contracts.md | Agent 间共享读取，不重复生成 | 写一次读多次 |
| project-brain.md | 每 Phase 增量更新，不全量重写 | 减少写入量 |

**Context Folding（上下文折叠）**：

对于需要多轮交互的 Agent（如修 Bug 的开发者），采用折叠策略：
```
轮次 1: 读取完整上下文 → 产出初版代码
轮次 2: 折叠轮次1细节 → 只保留摘要 + 新的错误信息 → 修复
轮次 3: 折叠轮次1-2 → 只保留最终状态 + 新问题 → 继续修复
```

> 避免每轮都携带完整历史，有效延长 Agent 的可用上下文空间。

#### 11.5.4 动态轮次限制

不同任务的复杂度不同，为每个 Agent 设定合理的最大轮次（max_turns），避免无效消耗：

| Agent 类型 | 建议 max_turns | 理由 |
|-----------|---------------|------|
| PM1/PM2 市场调研 | 8~12 | 需要搜索 + 分析 + 整理 |
| D1-D4 策划 | 10~15 | 创造性工作，需要思考空间 |
| TL 架构设计 | 10~15 | 需要读多个文件 + 设计 |
| E1-E5 开发 | 15~25 | 编码量最大，需要较多轮次 |
| TR 审查 | 10~15 | 需要通读代码 + 生成报告 |
| Q1-Q3 QA | 8~12 | 读代码 + 输出报告 |
| Bug 修复 | 5~8 | 目标明确，快速修复 |

**节省幅度**：合理的轮次限制可减少 **~24% 的无效 Token 消耗**。

#### 11.5.5 依赖图优化检查清单

Orchestrator 在规划每个 Phase 的 Agent 调度前应检查：

```
效率优化检查:
  □ 当前批次中，是否有可以并行的 Agent？（合并为单条多 Task 调用）
  □ 当前 Agent 的必读文件是否可以用摘要替代全文？
  □ 是否有结构化/重复性任务可以降级到轻量模型？
  □ Agent 的 max_turns 是否设置合理？（不多不少）
  □ 上一批次的产出是否可以增量传递而非全量传递？
  □ System Prompt 的固定前缀是否足够长以触发缓存？
```

---

## 12. 自动化 QA 与闭环验证

> **v5.0 架构升级**：从 v4.3 的"分层门禁"架构升级为"**两条通道 + 可选加速器**"架构。
> 核心变化：Puppeteer + SwiftShader 已在无 GPU 沙箱中可用，工具链按**数据采集环境**划分而非按"检测能力"分层。
>
> 📄 **详细参考**：完整的 QA 工具链实现细节、Action Script 格式、AI 修复 SOP → [UrhoX Lua 全自动 QA 闭环手册](UrhoX%20Lua%20全自动%20QA%20闭环手册.md)

### 12.0 架构总览：两条通道 + 可选加速器

**设计哲学**：不是层，是通道。按**运行环境**划分工具，而非按"检测能力"逐级分层。

```
┌─────────────────────────────────────────────────────────────┐
│                    QA 工具链全景                              │
│                                                             │
│  ┌──────────────────────┐   ┌──────────────────────────┐   │
│  │ 🏎️ 快速通道           │   │ 🎮 实机通道                │   │
│  │                      │   │                          │   │
│  │  LSP 静态分析        │   │  Puppeteer 自动化玩家    │   │
│  │  + TRAP 陷阱扫描     │   │  (screenshot-qa.js)      │   │
│  │                      │   │                          │   │
│  │  输入: Lua 源码      │   │  输入: 已构建的 dist/    │   │
│  │  环境: 纯文本        │   │  环境: Headless Chrome   │   │
│  │  耗时: 5-10 秒       │   │       + SwiftShader      │   │
│  │  无需 build          │   │  耗时: 30-60 秒          │   │
│  │                      │   │  需要 build              │   │
│  │  产出:               │   │                          │   │
│  │  • 类型/nil 错误     │   │  一次运行产出五类数据:    │   │
│  │  • 拼写错误          │   │  ① 截图（渲染结果）      │   │
│  │  • 未使用变量        │   │  ② 控制台日志            │   │
│  │  • require 路径错误  │   │  ③ JS/WASM 错误          │   │
│  │  • TRAP-001~008 匹配 │   │  ④ 引擎关键事件          │   │
│  │                      │   │  ⑤ 交互操作结果          │   │
│  └──────────┬───────────┘   └──────────┬───────────────┘   │
│             └──────────┬───────────────┘                    │
│                        ▼                                    │
│              ┌──────────────────┐                           │
│              │ 🤖 AI 诊断修复    │                           │
│              │  统一消费两通道    │                           │
│              │  的全部数据        │                           │
│              │  诊断→修复→验证   │                           │
│              └────────┬─────────┘                           │
│                       │                                     │
│             ┌─────────┴─────────┐                           │
│             │ 通过？             │                           │
│             ├── 是 → 🧑 人工验收 │ （主观判断：视觉/手感）    │
│             └── 否 → 循环修复    │                           │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ⚡ 可选加速器: Dry-Run 沙箱 (wasmoon)                 │   │
│  │  无 GPU、无需 build，唯一不可替代价值: 可编程断言      │   │
│  │  适用: 复杂业务逻辑的单元测试（资金计算、状态机等）    │   │
│  │  不适用: 简单项目、UI 项目、首次交付                   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**各通道独占价值**：

| 通道 | 独占价值（只有它能做的事） | 不做什么 |
|------|--------------------------|---------|
| **快速通道** (LSP + TRAP) | 零成本类型推导、nil 静态追踪、引擎陷阱模式匹配、无需 build | 不做运行时检测、不做视觉检查 |
| **实机通道** (Puppeteer) | 真实渲染截图、真实引擎日志、JS/WASM 错误、交互操作验证 | 不做静态类型分析（那是 LSP 的事） |
| **Dry-Run** (可选加速器) | 可编程断言、业务逻辑单元测试、不依赖 build | 不做视觉检查、不做真实交互测试 |
| **真机反馈** (补充通道) | 真实设备适配、触控体验、用户主观反馈 | 不做能被自动化的任何事 |
| **人工验收** | 主观判断（美感、手感、"好不好玩"） | 不做能被自动化的任何事 |

**通道选择决策表**：

| 修改类型 | 触发的通道 | 理由 |
|----------|:---------:|------|
| 修改变量名/类型标注 | 快速 | 纯语法 |
| 修改 UI 布局参数 | 快速 + 实机 | 需要看渲染结果 |
| 修改业务逻辑 | 快速 (+ Dry-Run) | 可选地跑断言 |
| 修改渲染/初始化代码 | 快速 + 实机 | 必须看渲染结果 |
| 新增模块/重构 | 快速 + 实机 | 需要全面检查 |
| 首次交付 | 快速 + 实机 | 全量检测 |

### 12.1 快速通道：Lua LSP 深度集成

> 🏎️ **快速通道组件**：纯文本分析，5-10 秒，无需 build。

`lua_lsp_client` MCP 工具提供完整的 LSP 协议访问，远超简单的"语法检查"。

#### 可用 LSP 方法与应用场景

| LSP 方法 | 功能 | 在框架中的应用 |
|----------|------|----------------|
| `textDocument/diagnostic` | 获取文件级/工作区级诊断 | Phase 6a 自动化静态分析（替代人工代码审查的部分工作） |
| `workspace/symbol` | 跨文件符号搜索 | Phase 5 验证 api-contracts 中声明的所有函数确实存在 |
| `textDocument/references` | 查找符号的所有引用 | 确认 API 契约中的接口被正确调用，无死代码 |
| `textDocument/hover` | 获取变量类型信息 | 排查类型不匹配的隐患（如 string 被当 number 使用） |
| `textDocument/definition` | 跳转到定义 | 验证 require 路径是否指向正确的模块 |

#### Phase 5 自动化 API 契约验证

在 Phase 5 整合验收时，Orchestrator 可通过 LSP 自动验证 api-contracts 的一致性：

```
自动化契约验证流程:
  1. 解析 api-contracts.md 中声明的所有公开函数签名
  2. 对每个函数调用 workspace/symbol 确认实现存在
  3. 对每个函数调用 textDocument/references 确认有调用方
  4. 对每个函数调用 textDocument/hover 确认参数/返回类型匹配
  5. 输出验证报告：
     ✅ GameState.init() — 已实现，被 main.lua:12 调用
     ❌ GameState.resetAll() — 声明但未实现！
     ⚠️ GameState.getGold() — 已实现但无调用方（死代码？）
```

#### Phase 6a LSP 工作区诊断

```lua
-- 获取整个工作区的 Error + Warning 级别诊断
lua_lsp_client({
  method: "textDocument/diagnostic",
  params: { severity: 2 }  -- 1=仅Error, 2=Error+Warning
})
```

**门禁标准**：工作区诊断 Error 数量 = 0，Warning 需人工评估。

### 12.2 快速通道：引擎陷阱自动检测脚本

> 🏎️ **快速通道组件**：基于 grep 的模式匹配，秒级完成，无需 build。

基于实战中反复出现的 Bug 模式，编写可在 Phase 6a 执行的自动化检测脚本（Shell）。

#### 检测规则清单

| 规则 ID | 检测内容 | 检测方法 | 对应实战 Bug |
|---------|----------|----------|-------------|
| TRAP-001 | require 了引擎内置全局变量 | grep `require.*["']cjson["']` | cjson 不能 require |
| TRAP-002 | NanoVG 渲染在 Update 事件中 | grep 绑定事件名 + nvgBeginFrame | 必须用 NanoVGRender |
| TRAP-003 | nvgCreateFont 在渲染循环中调用 | 检查函数调用位置 | 每帧调用导致显存泄漏 |
| TRAP-004 | 数组索引从 0 开始 | grep `\[0\]` 模式 | Lua 索引从 1 开始 |
| TRAP-005 | SetVisible 用于布局控制 | grep `SetVisible` 调用 | SetVisible 不影响布局流 |
| TRAP-006 | 缺少 flexShrink 导致溢出 | 检查 UI 容器配置 | Layout Overflow 警告 |
| TRAP-007 | 使用数字常量替代枚举 | grep `button == 0` 模式 | MOUSEB_LEFT 不等于 0 |
| TRAP-008 | io 库调用 | grep `io\.open\|io\.read` | 沙箱已移除 io 库 |

#### 脚本实现示例

```bash
# TRAP-001: 检测错误的 require 调用
grep -rn "require.*["']cjson["']" scripts/ && echo "❌ TRAP-001: cjson 是全局变量，不能 require"

# TRAP-002: 检测 NanoVG 在错误事件中渲染
grep -rn "nvgBeginFrame" scripts/ | while read line; do
  file=$(echo "$line" | cut -d: -f1)
  # 检查该文件是否订阅了 NanoVGRender 事件
  if \! grep -q "NanoVGRender" "$file"; then
    echo "❌ TRAP-002: $file 使用了 nvgBeginFrame 但未订阅 NanoVGRender 事件"
  fi
done

# TRAP-005: 检测 SetVisible 布局误用
grep -rn "SetVisible" scripts/ && echo "⚠️ TRAP-005: 检查 SetVisible 是否用于布局控制（应使用 RemoveChild/AddChild）"
```

**执行时机**：Phase 6a 静态分析层，在 QA Agent 启动前由 Orchestrator 自动执行。

**输出格式**：`docs/qa/trap-scan-report.md`

### 12.3 补充通道：真机调试反馈闭环

> 📱 **补充通道**：真实设备适配、触控体验验证。需用户配合扫码测试。

`get_debug_feedbacks` MCP 工具实现了从真机测试到 Agent 自动修复的完整闭环。

#### 闭环流程

```
┌─────────────────────────────────────────────────┐
│              真机 QA 闭环流程                     │
├─────────────────────────────────────────────────┤
│                                                   │
│  Step 1: build → 生成可预览版本                   │
│            ↓                                       │
│  Step 2: generate_test_qrcode → 生成测试二维码     │
│            ↓                                       │
│  Step 3: 用户/测试者扫码 → 在真机上操作             │
│            ↓                                       │
│  Step 4: 测试者提交反馈（截图 + 描述 + 日志自动附带）│
│            ↓                                       │
│  Step 5: get_debug_feedbacks → 拉取到本地          │
│          logs/feed_back/                           │
│          ├── summary.json                          │
│          ├── feedback_10001/                        │
│          │   ├── info.json        # 设备信息        │
│          │   ├── description.txt  # 问题描述        │
│          │   ├── logs/            # 运行时日志      │
│          │   └── screenshots/     # 问题截图        │
│          └── feedback_10002/                        │
│            ↓                                       │
│  Step 6: Orchestrator 读取反馈 → 分析问题           │
│            ↓                                       │
│  Step 7: 分配给对应开发 Agent 修复                  │
│            ↓                                       │
│  Step 8: build → 回到 Step 2（直到反馈清零）        │
│                                                   │
└─────────────────────────────────────────────────┘
```

#### Orchestrator 使用指南

```
真机反馈处理:
  1. 调用 get_debug_feedbacks（默认拉取未处理反馈并标记已处理）
  2. 读取 logs/feed_back/summary.json 获取反馈总览
  3. 对每条反馈：
     a. 读取 description.txt 理解问题
     b. 读取 logs/ 下的运行日志定位错误
     c. 查看 screenshots/ 确认 UI 问题（若为图片可直接读取）
  4. 汇总为 Bug 列表，按 P0/P1/P2 分级
  5. 分配给开发 Agent 修复
  6. 修复后 build → 通知用户重新测试
```

**注意**：`fetch_and_mark_processed: true`（默认）会自动将拉取的反馈标记为已处理，避免重复处理。如需查看历史反馈，设置 `status: 0` 查看全部。

### 12.4 实机通道：Puppeteer 自动化玩家 🔴 v5.0 新增

> 🎮 **实机通道核心**：Headless Chrome + SwiftShader 软件渲染，一次运行产出五类数据，30-60 秒。
> 📄 **详细参考**：Action Script 16 种交互类型、AI 修复 SOP → [QA 闭环手册 §5-§7](UrhoX%20Lua%20全自动%20QA%20闭环手册.md)

#### 环境状态（已解锁）

| 工具 | 安装状态 | 运行状态 | 说明 |
|------|----------|----------|------|
| Puppeteer | ✅ npm 安装成功 | ✅ **可运行** | 通过 `setup.sh` 用户空间提取系统库 |
| SwiftShader | ✅ 用户空间安装 | ✅ **可运行** | 软件 WebGL，无需 GPU |
| screenshot-qa.js | ✅ 就绪 | ✅ **可运行** | 567 行，含 LogCollector + ActionExecutor |

> **历史**：v4.3 时 Puppeteer 因缺少 libnspr4 等 10+ 系统库被标记为 BLOCKED。v5.0 通过 `setup.sh` 一键安装脚本，从 Chromium 安装包中提取所有 .so 到用户空间 `~/.local/lib/`，配合 `LD_LIBRARY_PATH` 彻底解决了此问题，无需 sudo 权限。

#### 一次运行，五类数据

```bash
# 模式 A：截图 + 日志采集（快速检查）
node test/qa-tools/screenshot-qa.js

# 模式 B：Action Script 交互脚本（深度测试）
node test/qa-tools/screenshot-qa.js --actions='[
  {"action":"wait","duration":3000},
  {"action":"screenshot","name":"after-load"},
  {"action":"click","x":640,"y":400},
  {"action":"wait","duration":1000},
  {"action":"screenshot","name":"after-click"},
  {"action":"key","key":"Escape"},
  {"action":"screenshot","name":"after-esc"}
]'
```

**产出**：

| 数据类型 | 文件 | 用途 |
|----------|------|------|
| ① 渲染截图 | `screenshots/*.png` | AI 视觉判断（黑屏？布局正确？） |
| ② 控制台日志 | `screenshots/console.log` | 运行时 print() 输出、引擎日志 |
| ③ JS/WASM 错误 | `screenshots/errors.log` | 崩溃定位（Lua 栈追踪通过此通道暴露） |
| ④ 引擎关键事件 | `screenshots/report.json` | `[UrhoX] Engine ready`、`Start() called` |
| ⑤ 交互操作结果 | `report.json` (Action 模式) | 每个 action 的执行状态和耗时 |

#### Action Script 交互能力（16 种操作）

| 操作 | 说明 | 示例 |
|------|------|------|
| `wait` | 等待指定毫秒 | `{"action":"wait","duration":3000}` |
| `screenshot` | 截取当前画面 | `{"action":"screenshot","name":"main-menu"}` |
| `click` | 鼠标左键点击 | `{"action":"click","x":640,"y":360}` |
| `key` | 键盘按键 | `{"action":"key","key":"Escape"}` |
| `type` | 键盘输入文本 | `{"action":"type","text":"player1"}` |
| `mousemove` | 鼠标移动 | `{"action":"mousemove","x":400,"y":300}` |
| `mousedown/mouseup` | 鼠标按下/松开 | 拖拽操作 |
| `drag` | 拖拽（从A到B） | `{"action":"drag","from":{...},"to":{...}}` |
| `scroll` | 滚轮滚动 | `{"action":"scroll","deltaY":-100}` |
| `tap` | 触控点击 | `{"action":"tap","x":640,"y":360}` |
| `swipe` | 触控滑动 | `{"action":"swipe","from":{...},"to":{...}}` |
| `evaluate` | 执行 JS 表达式 | `{"action":"evaluate","expression":"..."}` |
| `viewport` | 设置视口大小 | `{"action":"viewport","width":375,"height":812}` |

#### 集成到 Phase 6a

实机通道作为第零层自动化检测的核心组件（在快速通道之后执行）：

```
实机通道检测流程:
  1. build 通过
  2. 运行 screenshot-qa.js（模式 A 或 B）
  3. AI 消费五类数据：
     → 截图非黑屏、非全白 = 渲染正常
     → errors.log 为空 = 无崩溃
     → console.log 无 ERROR/WARN 关键词 = 运行健康
     → 引擎事件含 "Engine ready" + "Start() called" = 初始化成功
  4. 如有问题 → AI 诊断分类（CAT-1~7）→ 修复 → 重新验证
  5. 全部通过 → 进入 QA Agent 静态分析或人工验收
```

### 12.5 可选加速器：Lua Dry-Run 沙箱验证（wasmoon）

> ⚡ **可选加速器**：无 GPU、无需 build，唯一不可替代价值是**可编程断言**。
> 适用于复杂业务逻辑的单元测试（资金计算、状态机、页面导航等）。
> 不适用于简单项目、纯 UI 项目或首次交付。
>
> 📄 **独立文档**：完整实现细节 → [Lua Dry-Run Sandbox Testing Guide.md](Lua%20Dry-Run%20Sandbox%20Testing%20Guide.md)

#### 核心思路

**无需浏览器、GPU 或真机**，在 Node.js 中运行 Lua 5.4 解释器（wasmoon），配合 Mock 引擎 API，对游戏脚本进行"干跑"验证。可捕获静态分析无法发现的运行时错误：

| 检测能力 | 示例 | 版本 |
|----------|------|------|
| 模块加载失败 | `require("data.config")` 路径错误 | v4.4 |
| nil 值访问 | `attempt to index a nil value` | v4.4 |
| 类型错误 | `attempt to call a table value` | v4.4 |
| 方法缺失 | `attempt to call a nil value (method 'XXX')` | v4.4 |
| 初始化顺序错误 | 依赖模块未先加载 | v4.4 |
| Start() 执行崩溃 | 初始化逻辑中的运行时异常 | v4.4 |
| 页面导航异常 | push/pop/replace 后状态不一致 | v4.5 |
| 生命周期缺失 | onEnter/onExit 未触发 | v4.5 |
| **UI 按钮不可点击** | **onClick 闭包未绑定或异常** | **v4.6** |
| **状态修改不正确** | **属性 clamp、batch effects 逻辑错误** | **v4.6** |
| **游戏流程断裂** | **完整流程中某步骤导致异常** | **v4.6** |
| **项目结构自动分析** | **自动识别模块、页面、系统、onClick** | **v4.7** |
| **测试用例自动生成** | **根据项目特征动态推导测试集** | **v4.7** |
| **结构化报告输出** | **docs/qa/dry-run-report.md 自动生成** | **v4.7** |

#### 技术架构

```
┌─────────────────────────────────────────────────┐
│  Node.js (wasmoon)                              │
│                                                 │
│  ┌─────────────────────────────────────────┐    │
│  │  Lua 5.4 WASM Sandbox                   │    │
│  │                                         │    │
│  │  mock_engine.lua                        │    │
│  │  ├── MockObj (深度 metatable 代理)      │    │
│  │  ├── CallableTable (构造器+命名空间)    │    │
│  │  ├── 引擎全局变量 (scene, renderer...) │    │
│  │  ├── NanoVG 函数 (nvgRect, nvgText...) │    │
│  │  ├── 引擎常量 (KEY_*, MOUSEB_*, BT_*) │    │
│  │  ├── UI 库深度 Mock (Widget 链式方法)  │    │
│  │  ├── require 拦截 (urhox-libs → Mock)  │    │
│  │  ├── 事件捕获系统 (SubscribeToEvent)   │    │
│  │  ├── MockEventData + _FireEvent        │    │
│  │  ├── Widget 注册表 (查找/点击/遍历)   │    │
│  │  ├── 日志断言 API (_AssertLog*/Count) │    │
│  │  └── 状态快照 & Diff (_Snapshot*)     │    │
│  │                                         │    │
│  │  用户脚本 (via package.preload 注入)    │    │
│  │  ├── data/*.lua                         │    │
│  │  ├── systems/*.lua                      │    │
│  │  ├── ui/*.lua                           │    │
│  │  └── main.lua                           │    │
│  └─────────────────────────────────────────┘    │
│                                                 │
│  Node.js fs.readFileSync → doString 注入        │
│  pcall 错误捕获 → 结构化 QA 报告               │
└─────────────────────────────────────────────────┘
```

#### 关键实现要点

**1. wasmoon 安装与基本用法**

```bash
npm install wasmoon  # Lua 5.4 编译为 WASM，无原生依赖
```

```javascript
const { LuaFactory } = require('wasmoon');
const lua = await new LuaFactory().createEngine();
await lua.doString('print("Lua 5.4 in Node.js")');
```

**2. Mock 引擎 API 的三层策略**

| 层级 | Mock 对象 | 策略 |
|------|-----------|------|
| 通用层 | `MockObj(name)` | 深度 metatable 代理，任意属性访问/方法调用都返回新 MockObj，不会报 nil 错误 |
| 构造器层 | `CallableTable(name, fn)` | 既是构造函数又是命名空间（解决 `Vector3(1,2,3)` 和 `Vector3.UP` 共存问题） |
| 精细层 | UI 组件 Mock | 返回带 `AddChild`/`SetText` 等真实方法签名的 table，覆盖高频调用链 |

**3. 文件注入（绕过 WASM 文件系统隔离）**

```javascript
// wasmoon 的 Lua 无法直接 loadfile()，需要 Node.js 读取后注入
const code = fs.readFileSync(filePath, 'utf8');
await lua.doString('package.preload["' + moduleName + '"] = function(...)\n' + code + '\nend');
```

**4. 分层验证流程**

```
Phase 1: PRELOAD  → 语法级验证（能否解析为 Lua chunk）
Phase 2: REQUIRE  → 模块级验证（能否执行模块顶层代码、依赖链是否完整）
Phase 3: START()  → 初始化验证（Start 函数能否无崩溃执行）
```

#### 输出报告格式

```
=== DRY-RUN QA SUMMARY ===
Total modules: 13
Pass: 14 (13 require + Start)
Fail: 0

ALL MODULES PASSED
Result: ALL PASS
```

失败时输出具体错误定位：

```
FAILED MODULES:
  [REQUIRE_FAIL] ui.page_event: attempt to index a nil value (local 'config')
  [START_FAIL] Start(): attempt to call a nil value (method 'AddChild')
```

#### 集成到 Phase 6a 第零层

dry-run 作为第零层自动化检测的第 ④ 步，在 LSP 诊断和 TRAP 扫描之后执行：

```
④ Lua Dry-Run → wasmoon 沙箱加载全部模块 + 调用 Start()（详见 §12.5）
   → PRELOAD/REQUIRE 失败 = Error 级，打回修复
   → START 失败 = Warning 级，记录但不阻塞（可能是 mock 精度不足）
```

#### 事件驱动测试（进阶）🔴 v4.5 新增

在基础 dry-run（模块加载 + Start()）之上，进一步**捕获事件订阅**并**主动触发合成事件**，驱动游戏逻辑执行完整业务流程。

##### 核心机制

**1. 事件捕获**：改造 `SubscribeToEvent` 为捕获模式

```lua
local _eventHandlers = {}  -- eventName -> [{handler, isString}]

SubscribeToEvent = function(arg1, arg2, arg3)
    local eventName, handler
    if arg3 then  -- SubscribeToEvent(node, "EventName", handler)
        eventName, handler = arg2, arg3
    else          -- SubscribeToEvent("EventName", handler)
        eventName, handler = arg1, arg2
    end
    _eventHandlers[eventName] = _eventHandlers[eventName] or {}
    table.insert(_eventHandlers[eventName], { handler = handler, isString = type(handler) == "string" })
end
```

**2. MockEventData**：支持 UrhoX 的两种访问模式

```lua
-- 模式 1: eventData["Key"]:GetInt()
-- 模式 2: eventData:GetInt("Key")
local function MockEventData(data)
    local ed = {}
    setmetatable(ed, {
        __index = function(self, key)
            if data[key] ~= nil then
                local val = data[key]
                return { GetInt = function() return val end, GetFloat = function() return val end, ... }
            end
            if key == "GetInt" or key == "GetFloat" then
                return function(self2, k) return data[k] end
            end
        end,
    })
    return ed
end
```

**3. 合成事件触发**

```lua
-- 触发键盘事件
_FireEvent("KeyDown", { Key = KEY_ESCAPE })

-- 触发鼠标点击
_FireEvent("MouseButtonDown", { Button = MOUSEB_LEFT, X = 500, Y = 300 })

-- 模拟 N 帧更新
_SimulateFrames(60, 0.016)  -- 60帧, 每帧16ms
```

**4. Local 变量探针注入**

Lua 模块级 `local` 变量对外部 `doString` 不可见。解决方案：在 main.lua 注入时自动追加探针代码：

```javascript
// Node.js 侧自动注入
if (moduleName === 'main') {
    code += '\nlocal _origStart = Start\n';
    code += 'function Start()\n    _origStart()\n';
    code += '    _G.pageManager_ = pageManager_\n';  // 暴露为全局
    code += '    _G.gameState_ = gameState_\n';
    code += 'end\n';
}
```

##### 验证能力对比

| 验证维度 | 基础 dry-run | 事件驱动 dry-run |
|----------|-------------|-----------------|
| 模块加载 | ✅ | ✅ |
| Start() 执行 | ✅ | ✅ |
| 页面导航流程 | ❌ | ✅ push/pop/replace/popToRoot |
| 页面生命周期 | ❌ | ✅ onEnter/onExit/onPause/onResume |
| 键盘事件处理 | ❌ | ✅ KeyDown/KeyUp |
| 帧更新模拟 | ❌ | ✅ N 帧连续 Update |
| 全生命周期 | ❌ | ✅ Start → 交互 → cleanup |

##### 测试场景编写模式

```lua
-- 场景：验证 ESC 键从 create 页返回 home 页
pageManager_:push("create")
assert(pageManager_:getCurrentPageName() == "create")

_FireEvent("KeyDown", { Key = KEY_ESCAPE })

assert(pageManager_:getCurrentPageName() == "home")
assert(pageManager_:getStackDepth() == 1)
```

##### 集成到 Phase 6a

事件驱动测试作为第零层第 ⑤ 步（可选，大型项目推荐）：

```
⑤ 事件驱动测试 → 合成事件驱动业务流程验证（详见 §12.5 事件驱动测试）
   → 页面导航异常 / 生命周期缺失 = Warning 级
   → 覆盖率报告附入 auto-scan-report.md
```

#### 完整测试能力（进阶 v2）🔴 v4.6 新增

在事件驱动测试基础上，进一步支持 **UI 交互模拟**、**结构化日志断言**、**游戏状态深度检查**，实现接近真实测试流程的自动化 QA。

##### 1. Widget 注册表 — UI 查找与点击

MockWidget 创建时自动注册到全局 `_WidgetRegistry`，测试代码可按文本或类型查找并触发 onClick：

```lua
-- 按文本查找 Widget
local btn = _FindWidget("开始新人生")     -- 子串匹配
local btns = _FindWidgetsByType("Button") -- 按类型查找

-- 触发点击（调用 Widget props 中的 onClick 闭包）
local ok, err = _ClickWidget(btn)

-- 一步到位：查找 + 点击
local ok, err = _FindAndClick("开始新人生")

-- 调试：列出所有已注册 Widget
print(_DumpWidgets())
```

**原理**：MockWidget 工厂在创建每个 Widget 时执行 `table.insert(_WidgetRegistry, w)`，保留 `_props.onClick` 闭包引用。`_ClickWidget` 通过 `pcall(onClick, widget)` 安全调用。

**典型用例**：

```lua
-- 验证点击"开始新人生"触发页面跳转
_ClearWidgetRegistry()
pageManager_:push("home")

local homePage = pageManager_.pages["home"]
homePage:startNewGame()  -- 或 _FindAndClick("开始新人生")

assert(pageManager_:getCurrentPageName() == "create")
```

```lua
-- 验证事件页的选项按钮可点击并触发结果页
eventSystem_:initialize()
local event = eventSystem_:getNextEvent()
pageManager_:push("event", { event = event })

local buttons = _FindWidgetsByType("Button")
_ClickWidget(buttons[1])  -- 点击第一个选项

assert(pageManager_:getCurrentPageName() == "result")
```

##### 2. 日志断言 API — 结构化验证

替代手动 `grep` 日志，提供断言式验证：

```lua
-- 基础断言
_AssertLogContains("onEnter")                 -- 至少一行包含 pattern
_AssertLogNotContains("ERROR")                -- 无任何行匹配 pattern
_AssertNoErrors()                             -- _AssertLogNotContains("ERROR") 的快捷方式

-- 计数
local n = _CountLogs("onEnter")              -- 匹配行数
assert(n >= 2, "至少 2 次 onEnter")

-- 管理
_ClearLogs()                                  -- 清空日志（测试之间隔离）
local logs = _GetLogs()                       -- 获取日志数组
local allText = _GetLogString()               -- 拼接为单个字符串
```

**`print` 双通道捕获**：所有 `print()` 输出同时写入 `_CapturedLogs`（Lua 侧）和 Node.js console（宿主侧），测试断言使用 Lua 侧数据。

##### 3. 游戏状态快照 & Diff

```lua
-- 拍快照（记录属性、阶段、事件数、进度）
local before = _SnapshotState(gameState_)

-- ... 执行游戏操作 ...

local after = _SnapshotState(gameState_)
local changes = _CompareSnapshots(before, after)
-- 输出: ["  intelligence: 5 -> 7 (+2)", "  stage: childhood -> youth", ...]
```

**丰富的断言工具**：

```lua
_AssertEqual(actual, expected, "message")     -- 精确相等
_AssertTruthy(value, "message")               -- 非 nil / 非 false
_AssertInRange(value, 0, 10, "message")       -- 范围检查
_DeepEqual(tableA, tableB)                    -- 深度表比较
```

##### 4. Lua 侧测试运行器

支持在 Lua 侧编排测试用例，自动收集 pass/fail 和日志：

```lua
_TestResults = {}  -- 重置

_RunTest("属性修改验证", function()
    gameState_:reset()
    gameState_:modifyAttribute("intelligence", 3)
    _AssertEqual(gameState_:getAttribute("intelligence"), 8)
end)

_RunTest("完整游戏流程", function()
    gameState_:reset()
    eventSystem_:initialize()
    -- ... 完整流程 ...
end)

print(_GetTestSummary())
-- [PASS] 属性修改验证
-- [PASS] 完整游戏流程
-- Total: 2, Pass: 2, Fail: 0
-- ALL PASS
```

##### 验证能力全景对比（v4.4 → v4.5 → v4.6 → v4.7）

| 验证维度 | v4.4 基础 dry-run | v4.5 事件驱动 | v4.6 完整测试 | v4.7 自适应 |
|----------|:-:|:-:|:-:|:-:|
| 模块加载 | ✅ | ✅ | ✅ | ✅ 自动 |
| Start() 执行 | ✅ | ✅ | ✅ | ✅ 自动 |
| 页面导航 | ❌ | ✅ | ✅ | ✅ 自动发现 |
| 生命周期 | ❌ | ✅ | ✅ | ✅ 自动 |
| 键盘事件 | ❌ | ✅ | ✅ | ✅ |
| 帧更新模拟 | ❌ | ✅ | ✅ | ✅ 自动 |
| **UI 按钮点击** | ❌ | ❌ | ✅ | ✅ 自动发现 |
| **日志断言** | ❌ | ❌ | ✅ | ✅ |
| **状态快照 & Diff** | ❌ | ❌ | ✅ | ✅ 自动 |
| **游戏流程端到端** | ❌ | ❌ | ✅ | ✅ 自动 |
| **Lua 侧测试运行器** | ❌ | ❌ | ✅ | ✅ |
| **项目结构自动分析** | ❌ | ❌ | ❌ | ✅ |
| **测试用例自动生成** | ❌ | ❌ | ❌ | ✅ |
| **结构化报告输出** | ❌ | ❌ | ❌ | ✅ |

##### 集成到 Phase 6a

完整测试能力作为第零层第 ⑥ 步（推荐所有中大型项目启用）：

```
⑥ 完整沙箱测试 → UI onClick 模拟 + 状态断言 + 全流程验证（详见 §12.5 完整测试能力）
   → 流程断裂 / 状态异常 = Error 级
   → 测试报告（pass/fail/coverage）附入 auto-scan-report.md
⑦ 自适应测试 → 项目分析 + 自动生成测试 + 报告输出（详见 §12.5 项目自适应测试）🔴 v4.7 新增
   → 扫描 scripts/ 自动推导测试用例
   → 结果输出到 docs/qa/dry-run-report.md
```

#### 项目自适应测试（Adaptive Testing）🔴 v4.7 新增

在完整测试能力基础上，实现 **"零配置、项目感知、自动生成"** 的测试流程。AI 扫描项目结构后自动生成测试脚本，运行后输出结构化报告到 `docs/qa/`。

##### 核心理念

> **AI 不应该手写每一条测试用例，而应该根据项目结构自动推导出测试集。**

传统做法：人工编写测试 → 手动维护 → 项目变更后测试过时
自适应做法：扫描项目 → 自动生成测试 → 每次运行自动适配最新代码

##### 四阶段流水线

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐
│ Phase 1     │    │ Phase 2     │    │ Phase 3     │    │ Phase 4         │
│ 项目分析    │───▶│ 测试生成    │───▶│ 测试执行    │───▶│ 报告输出        │
│             │    │             │    │             │    │                 │
│ • 扫描模块  │    │ • 模块加载  │    │ • wasmoon   │    │ • docs/qa/      │
│ • 检测页面  │    │ • 页面导航  │    │   执行全部  │    │   dry-run-      │
│ • 发现事件  │    │ • UI 交互   │    │   测试用例  │    │   report.md     │
│ • 识别系统  │    │ • 状态验证  │    │             │    │                 │
│ • 统计 onClick│  │ • 流程端到端│    │             │    │ • 项目元信息    │
└─────────────┘    └─────────────┘    └─────────────┘    │ • 测试结果表    │
                                                         │ • 失败详情      │
                                                         │ • 覆盖率统计    │
                                                         └─────────────────┘
```

##### Phase 1: 项目分析（自动感知）

扫描 `scripts/` 目录，自动识别：

| 检测项 | 方法 | 示例输出 |
|--------|------|----------|
| 模块列表 | 递归扫描 `.lua` 文件 | `main, ui.page_home, systems.game_state, ...` |
| 页面注册 | 正则匹配 `registerPage("name"` | `home, create, event, result, ending` |
| 事件订阅 | 匹配 `SubscribeToEvent` | `Update, KeyDown, NanoVGRender, ...` |
| onClick 处理器 | 匹配 `onClick` 出现次数 | `9 across 5 files` |
| 系统模块 | 匹配 `GameState, EventSystem, ScoreSystem` 等关键词 | `GameState, EventSystem, PageManager` |
| 入口模块 | 检测含 `function Start()` 的文件 | `main` |

##### Phase 2: 测试生成（自动推导）

根据 Phase 1 分析结果，动态生成测试用例：

| 检测到的特征 | 自动生成的测试 |
|-------------|---------------|
| N 个模块 | T-LOAD: 模块加载测试 |
| 存在 `Start()` | T-START: 入口执行 + T-PROBE: 局部变量探针注入 |
| M 个页面 | T-PAGE-{name}: 每个页面的导航 + 生命周期测试 |
| 页面栈 | T-STACK-OPS: push/pop/popToRoot 操作 + T-ESC-ROOT: 根页面安全性 |
| onClick > 0 | T-WIDGET-REG: Widget 注册表 + T-WIDGET-CLICK: 按钮点击 |
| GameState 存在 | T-STATE-RESET/MODIFY/SNAPSHOT: 状态操作三件套 |
| EventSystem 存在 | T-EVENT-INIT/CHOICE/PLAYTHROUGH: 事件系统全流程 |
| 任何项目 | T-FRAMES: 60 帧模拟 + T-CLEANUP: 清理验证 |

**关键特性**：测试集随项目结构自动扩缩 — 简单项目可能生成 5 条测试，复杂 RPG 可能生成 30+ 条。

##### Phase 3: 测试执行

使用 wasmoon 沙箱统一执行所有生成的测试，与 v4.6 的测试基础设施共享：
- Widget 注册表 + onClick 模拟
- 日志断言 API
- 状态快照 & Diff
- Lua 侧测试运行器

##### Phase 4: 报告输出

每次运行后自动生成 Markdown 报告到 `docs/qa/dry-run-report.md`：

```markdown
# Dry-Run Test Report

| Field | Value |
|-------|-------|
| Generated | 2026-03-22 08:19:14 UTC |
| Project | /workspace/scripts |
| Modules | 13 |
| Pages | home, create, event, result, ending |
| onClick Handlers | 9 across 5 files |
| Systems | GameState, EventSystem, ScoreSystem, PageManager |
| **Result** | **20/20 PASS (ALL PASS)** |

## Test Results
| # | ID | Test | Result | Detail |
|---|-----|------|--------|--------|
| 1 | T-LOAD | Module Loading | PASS | 13 modules loaded |
| 2 | T-START | Start() Execution | PASS | Start() OK |
| ... | ... | ... | ... | ... |

## Project Analysis
### Detected Modules (13)
### Page Flow
### Test Coverage by Category
```

**报告用途**：
- 作为 QA 留档，追溯历次测试结果
- 发现回归问题（对比前后报告的 PASS/FAIL 变化）
- 为 Code Review 提供测试覆盖率证据

##### PoC 验证结果

已在"人生模拟器"项目上验证：

```
[Phase 1] Analyzing project structure...
  Modules: 13 | Pages: 5 | onClick: 9 | Systems: 4

[Phase 2] Generating tests...
  Generated 20 test scenarios

[Phase 3] Running tests...
  20/20 ALL PASS

[Phase 4] Report saved to: docs/qa/dry-run-report.md
```

##### 集成到开发工作流

```
代码变更
  ↓
AI 自动运行自适应测试
  ↓
检查 docs/qa/dry-run-report.md
  ↓
├─ ALL PASS → 继续开发
└─ 有 FAIL  → 定位问题 → 修复 → 重新测试
```

自适应测试建议在以下时机自动触发：
1. **功能开发完成后** — 验证新增功能不破坏现有逻辑
2. **重构完成后** — 确保模块接口未被意外改变
3. **用户请求 QA** — 一键生成完整测试报告
4. **交付前** — 最终验证所有系统协同工作

#### 局限性与注意事项

| 局限 | 说明 | 缓解策略 |
|------|------|----------|
| Mock 精度 | 引擎 API 返回值可能与真实行为不同 | START 失败归为 Warning，不直接阻塞 |
| 运行时逻辑 | 渲染相关逻辑无法验证视觉正确性 | 事件驱动 + onClick 可覆盖业务逻辑层 |
| 异步行为 | 无法模拟网络请求、资源加载回调 | 仅验证同步初始化路径 |
| 文件系统隔离 | wasmoon 的 Lua 无法直接访问宿主文件系统 | 通过 Node.js 读取 + package.preload 注入 |
| Widget 注册表 | 仅捕获 MockWidget 创建的 Widget，不含原生 UI | 游戏项目统一使用 urhox-libs/UI 即可全覆盖 |
| onClick 闭包作用域 | 闭包引用的 `self` 必须在创建时有效 | 测试前确保页面已正确 build() |

### 12.6 AI 自动修复闭环 🔴 v5.0 新增

> 📄 **详细参考**：完整的问题分类（CAT-1~7）、修复策略、退出条件、AI Agent SOP → [QA 闭环手册 §9-§12](UrhoX%20Lua%20全自动%20QA%20闭环手册.md)

#### 核心理念

不是"先检测完，再修复"，而是"**检测-修复-验证**"一体化循环。AI 是循环的驱动者，两条通道是它的"感官"。

#### 循环流程

```
┌──────────────────────────────┐
│       AI 修复循环             │
│                              │
│  快速通道 + 实机通道          │
│         ↓                    │
│    有问题？                   │
│    ├── 否 → ✅ 交付人工验收   │
│    └── 是 ↓                  │
│    AI 分类 (CAT-1~7)         │
│         ↓                    │
│    AI 修复 + build            │
│         ↓                    │
│    智能选择通道重新验证        │
│    └── 循环（上限 3 轮/问题） │
│                              │
│  超限/回归 → 标记人工处理     │
└──────────────────────────────┘
```

#### 问题分类与通道选择

| 分类 | 问题类型 | 数据来源 | 修复后验证通道 | 修复成功率 |
|------|----------|----------|:-----------:|:---------:|
| CAT-1 | 语法/类型错误 | 快速通道 (LSP) | 快速 | ~95% |
| CAT-2 | 模块加载失败 | 快速 / 实机 | 快速 | ~85% |
| CAT-3 | 运行时崩溃 | 实机 (errors.log) | 快速 + 实机 | ~70% |
| CAT-4 | UI 布局异常 | 实机 (截图) | 实机 | ~60% |
| CAT-5 | 渲染异常 | 实机 (截图) | 实机 | ~50% |
| CAT-6 | 引擎初始化失败 | 实机 (engineEvents) | 实机 | ~40% |
| CAT-7 | 业务逻辑错误 | Dry-Run (断言) | Dry-Run | ~55% |

#### AI Agent SOP（标准操作流程）

```
=== Phase A: 快速通道 ===
1. LSP 诊断 → 修复 CAT-1/CAT-2 → 重复至清零（通常 1-2 轮）

=== Phase B: 实机通道 ===
2. build → screenshot-qa.js → 分析五类数据
3. 发现 CAT-3~6 → 修复 → build → 重新截图验证（通常 1-3 轮）

=== Phase C: 可选 Dry-Run ===
4. （仅复杂业务逻辑）运行断言 → 修复 CAT-7 → 重跑

=== Phase D: 交付 ===
5. 输出修复摘要 → 通知用户人工验收
```

#### 退出条件与安全阀

| 条件 | 动作 |
|------|------|
| 所有检测通过 | ✅ 交付人工验收 |
| 单问题 3 轮未解决 | ⚠️ 跳过，标记人工 |
| 修复引入回归 | ❌ 回滚 + 标记人工 |
| 总轮次 > 10 | 🛑 停止，输出诊断摘要 |

### 12.7 QA 自动化成熟度模型

| 等级 | 能力 | 当前状态 | 依赖 |
|------|------|----------|------|
| L1 快速通道 | LSP 诊断 + TRAP 陷阱扫描 | ✅ **可立即使用** | 零依赖 |
| L2 实机通道 | L1 + Puppeteer 截图/日志/交互（五类数据一次采集） | ✅ **可立即使用** 🔴 v5.0 解锁 | `setup.sh` 一键安装 |
| L3 AI 闭环 | L2 + AI 自动修复循环（CAT-1~7 分类 → 修复 → 验证） | ✅ **可立即使用** | L2 + AI Agent |
| L4 可选加速器 | L3 + Dry-Run 可编程断言 | ✅ **可选使用** | wasmoon (npm) |
| L5 真机验证 | L3/L4 + 真机反馈闭环 | ✅ **可选使用** | 需用户配合扫码测试 |
| L6 智能化 | L5 + AI 视觉回归比对 + 自动生成 Action Script | 🔮 远期规划 | 视觉模型 + 行为建模 |

**当前推荐**：所有项目至少达到 **L3**（快速通道 + 实机通道 + AI 闭环），复杂业务逻辑项目推荐加入 **L4** Dry-Run 断言。

---

*Framework Version: 5.0*
*Last Updated: 2026-03-22*
*Based on: Claude Agent SDK Task Tool + UrhoX Engine*
*v5.0 变更摘要: 集成两条通道 QA 架构（快速通道 LSP + 实机通道 Puppeteer）、AI 自动修复闭环、Phase 4/5 嵌入式 QA、6 级成熟度模型*
