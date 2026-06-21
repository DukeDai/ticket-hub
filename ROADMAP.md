# ROADMAP · TicketHub 从代码健康到商业可用的演化路线图

> **生成时间**: 2026-06-17
> **基于**: EVOLUTION.md (C0-C10) + 4 份并行研究（携程/同程/飞猪、Klook/Viator/GYG/Tiqets、美团/点评/抖音、代码考古）
> **目标读者**: 项目 owner、后续 session 的接手 agent、技术评审
> **核心问题**: EVOLUTION.md §8.2 协议已终止（C9 + C10 双 0/0），代码健康已收敛。**下一阶段要回答的不是"代码有什么 bug"，而是"产品接下来要做什么"**。

---

## 0. 执行摘要（TL;DR）

| 维度 | 现状 | 目标 |
| --- | --- | --- |
| **代码健康** | tsc 0 / lint 0 / build 33 routes / 87.1 kB First Load JS | 已达成 ✅（C0-C10 累积） |
| **测试覆盖** | **0%** | v1.0 上线前必须 ≥ 70%（strategy + service + API 边界） |
| **支付** | mock only | v1.0 接通 Stripe（国际）/ 微信支付 + 支付宝（国内） |
| **退款** | service / route / UI 三层全无 | v1.0 上线退款闭环 |
| **凭证核销** | 仅静态 QR 字符串 | v1.0 PWA Pass + 动态码 + 相机扫码 |
| **营销** | 全无 | v1.1 平台券 / 满减 / 秒杀 |
| **多语言** | 仅 zh-CN | v2.0 接入 |
| **平台化** | 单租户、单类目 | v2.0 多商家 + 开放 API |

**核心判断**: TicketHub v0 是一个**"内功扎实"的产品骨架**，但**距离商业部署差 3-4 个月工程量**。路线图按 **4 个 phase 推进**，每 phase 末尾跑演化循环（CLAUDE.md §8），保证每个里程碑可独立 deploy 且无 🔴。

**差异化策略（已确认 §9.D2）**: **不做会员体系，纯走产品深度**。差异化通过产品能力（动态核销码 / 退改政策分级 / Apple Wallet / 即时确认率 / 凭证改期）实现，而非商业设计（订阅 / 黑鲸 / 88VIP）。这条路径与 Klook / Tiqets 的"产品深度"路线一致，与携程 / 美团的"全链路 + 商业设计"路线刻意保持距离。

**v1.0 启动前置（已确认 §9.D4）**: 先 commit C9 + C10 的 14 个 working tree 文件改动，再启 v1.0 cycle 11。具体 commit 切分见 §10。

**支付策略（已确认 §9.D1）**: v1.0 国际优先（Stripe SDK + Webhook）；v1.1 再补国内支付（微信 + 支付宝）。PaymentProvider 抽象在 v1.0 引入，未来扩展无痛。

**退款策略（已确认 §9.D3）**: v1.0 简单规则（未使用全额退 + 已使用部分退），3-5 人天。阶梯式 / 商家自定义延后到 v1.1+。

---

## 1. 业界标杆对标（Ctrip / Klook / 美团 × TicketHub）

### 1.1 三家"票券"哲学对比

| 平台 | 票券哲学 | 核心壁垒 | 单类目可移植性 |
| --- | --- | --- | --- |
| **携程/同程/飞猪** | "票 + 服务 + 履约"全链路 | 71% 中国市场份额（携程）+ 同程驿站（线下柜台）+ 飞猪阿里生态 | **中**——"履约承诺"和"按日库存"可移植，"全品类"和"全球供应链"不可移植 |
| **Klook/Viator/GYG/Tiqets** | "体验内容 + 国际化" | Klook Pass 联票 / Viator 24h 取消 + CFAR / GYG Originals 自营 / Tiqets 即时确认 | **高**——退改政策分级、Apple Wallet 集成、AI 行程规划均可移植 |
| **美团/点评/抖音** | "LBS + 核销 + 短视频种草" | 爆品榜单 / 拼团 / 直播转化 / 收银台集成 | **高**——动态核销码、拼团、LBS 推荐均适合单类目 |

### 1.2 共性能力清单 vs TicketHub 现状

> 完整版 47+ 项见 [`docs/research/ota-ticket-products-2025-2026.md`](docs/research/ota-ticket-products-2025-2026.md) §2。
> 此处只列 TicketHub **缺**或**部分缺**的能力（其他家全有）。

| # | 能力 | 携程 | Klook | 美团 | TicketHub | 优先级 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **按日库存 + 价格分人群**（成人/儿童/家庭套票） | ✓ | ✓ | ✓ | △ SightStrategy 部分 | **P0** |
| 2 | **退款政策矩阵**（未使用/已使用/已过期/已核销） | ✓ | ✓ | ✓ | ✗ | **P0** |
| 3 | **阶梯式退订费**（T-72h 100% / T-24h 50%） | ✓ | ✓ | ✓ | ✗ | **P0** |
| 4 | **真实支付集成**（Stripe/微信/支付宝） | ✓ | ✓ | ✓ | ✗（mock only） | **P0** |
| 5 | **动态核销码**（防截图） | ✓ | ✓ | ✓ | ✗ | **P0** |
| 6 | **即时确认 vs 二次确认** | ✓ | ✓ | ✓ | △ 仅 instant | **P1** |
| 7 | **凭证改期 / 换人** | ✓ | ✓ | ✓ | ✗ | **P1** |
| 8 | **凭证 Apple Wallet / Google Wallet 集成** | ✓ | ✓ | △ | ✗ | **P1** |
| 9 | **优惠券叠加**（平台/商家/银行） | ✓ | ✓ | ✓ | ✗ | **P1** |
| 10 | **CMS 编辑 SKU 变体 / 按日库存** | ✓ | ✓ | ✓ | ✗（硬编码 `[]`） | **P1** |
| 11 | **CMS 分类编辑/删除/排序** | ✓ | ✓ | ✓ | ✗（仅新增） | **P1** |
| 12 | **CMS 订单退款/取消按钮** | ✓ | ✓ | ✓ | ✗ | **P1** |
| 13 | **前台订单"去支付"按钮**（pending 重试） | ✓ | ✓ | ✓ | ✗ | **P1** |
| 14 | **per-account login lockout** | ✓ | ✓ | ✓ | ✗ | **P1** |
| 15 | **库存预占 + 释放**（下单锁库 N 分钟） | ✓ | ✓ | ✓ | ✗ | **P1** |
| 16 | **拼团 / 秒杀 / 砍价** | ✓ | ✓ | ✓ | ✗ | **P2** |
| 17 | **VIP 价 / 会员价** | ✓ | ✓ | ✓ | ✗ | **P2** |
| 18 | **推广员 / Affiliate 分销** | ✓ | ✓ | ✓ | ✗ | **P2** |
| 19 | **AI 行程规划** | ✓ | ✓ | △ | ✗ | **P3** |
| 20 | **多语言 / 多币种** | ✓ | ✓ | △ | ✗ | **P3**（v2.0） |

---

## 2. TicketHub 现状盘点（基于 2026-06-17 代码考古）

> 详细盘点见 [附录 A](#附录-a当前状态完整盘点)

### 2.1 已具备能力（✓ 完整）

- **数据模型**: 6 个 Mongoose model，CLAUDE.md §4 "do not remove" 索引全部保留；Order 有 2 个 TTL（pending 立即 / paying 5 分钟兜底）
- **业务逻辑**: 5 个 service 集中所有写操作；5 个 strategy 实现 sight/show/dining/experience/other 差异化定价与库存
- **API**: 17 个 endpoint，HOF 链 100% 覆盖（withError → withValidation → withAuth）；CSRF / 限流 / Cache-Control 白名单 / Zod 校验 / bcrypt / JWT / HSTS+CSP 全部就位
- **CMS 骨架**: 商品/分类/订单/票券核销 CRUD（**缺变体编辑、分类编辑、订单操作按钮**）
- **前台骨架**: 列表 / 详情 / 购物车 / 结算 / 订单 / 票券钱包全流程跑通（**缺订单"去支付"重试、分页**）
- **演化协议**: CLAUDE.md §8.2 终止条件达成（C9 + C10 双 0/0）

### 2.2 部分实现（⚠ 影响商业可用）

| 类别 | 描述 | 影响 |
| --- | --- | --- |
| **支付** | payOrder 是 `provider: 'mock'`（OrderService.ts:258） | 🔴 **商业级阻塞** |
| **退款** | Order 有 `refunded` / `partial_refunded` 状态值，**无任何 service/route/UI 触发它** | 🔴 |
| **CMS 商品编辑** | ProductForm 提交 `skuVariants: []` / `dailyInventory: []`（硬编码） | 🟡 |
| **CMS 分类管理** | CategoryManager 只支持新增，**无编辑/删除/排序 UI** | 🟡 |
| **CMS 订单管理** | 列表只显示商品标题首项，**无退款/取消按钮** | 🟡 |
| **前台订单列表** | 硬选 limit 50，**无分页** | 🟡 |
| **前台订单详情** | pending 状态**无"去支付"按钮** | 🟡 |

### 2.3 缺失能力（按优先级）

- **P0**: 真实支付、退款政策引擎、动态核销码、staff scope to own products
- **P1**: CMS 编辑变体/库存、分类管理、订单操作按钮、订单"去支付"、库存预占、per-account login lockout
- **P2**: 优惠券 / 满减 / 秒杀、VIP 价、Affiliate 分销、AI 行程规划（v2.0）
- **测试基建**: 0% → 70%（v1.0 上线门槛）

### 2.4 与 EVOLUTION.md 的关键不一致

> 接手 session 应以**代码为准**，EVOLUTION.md 是叙述/决策记录而非 API contract

| EVOLUTION.md 描述 | 实际情况 |
| --- | --- |
| C5: "checkout 失败跳订单详情 + 去支付按钮" | **代码缺**（`orders/[id]/page.tsx:28` 仅 `'✅ 已支付'`） |
| C10: "6 个 img warning" | **实测 5 个**（cms/products/new 改用了 ProductForm） |
| C9: "5 个文件 uncommitted" | **实测 14 个**（C9 + C10 全部未 commit） |
| §3.2: "Server Actions for forms" | **CMS 全部走 fetch POST** 而非 Server Action |

---

## 3. 路线图（v1.0 → v2.0）

> **时间估算**: 团队 2-3 工程师，总周期 20-26 周（约 6 个月）
> **每 phase 末尾**: 跑演化循环（CLAUDE.md §8），确保无 🔴 + 关键 🟡 收敛
> **测试基建轨道**贯穿所有 phase（详见 §4）

### Phase 1 · v1.0 商业可用最小集（MVP-for-Production）

**周期**: 4-6 周
**目标**: 可上线接真实流量；有支付/退款闭环；CMS 可日常运营
**入口条件**: 测试基建（§4）v1.0 部分达成（strategy + service ≥ 70% 覆盖）

| 优先级 | 功能 | 主要任务 | 验收标准 | 来源 |
| --- | --- | --- | --- | --- |
| **P0** | 测试基建（v1.0 部分） | Vitest 配置 + 覆盖 sight/show/dining/strategy + 关键 service | strategy 边界 100%，OrderService payOrder/cancelOrder 100% | EVOLUTION C5 遗留 |
| **P0** | 真实支付集成 | Stripe SDK + Webhook；mock 替换为 `provider: 'stripe'` | 沙箱测试通过：createPaymentIntent → webhook → voucher 签发 | 代码考古 #P0 |
| **P0** | 退款政策引擎 | `Order.refundPolicy` enum + `OrderService.refundOrder` + `/api/orders/[id]/refund` route + CMS 退款按钮 + 前台退款按钮 | 未使用 → 全额退；阶梯式手续费；部分退（多张券退 1 张） | OTA §2.5 + 美团 §1.4 |
| **P0** | 动态核销码 | voucher 加 `dynamicCode` 字段；TOTP 算法每 30 秒刷新 | staff 扫码得到"当前有效码"才能核销；旧码过期 | 美团 §1.3 |
| **P0** | staff scope to own products | Product.merchantId schema；CMS/orders 限权 | staff A 看不到 staff B 的订单 | EVOLUTION C5 遗留 |
| **P1** | CMS 编辑 SKU 变体 / dailyInventory | ProductForm 加可变体/按日库存编辑器 | 创建后能编辑变体价格/库存 | 代码考古 #P1 |
| **P1** | CMS 分类管理（编辑/删除/排序） | CategoryManager 加 modal + 拖拽排序 | 分类 CRUD 完整 | 代码考古 #P1 |
| **P1** | CMS 订单退款/取消按钮 | CmsOrderDetailPage 加操作按钮 | staff 一键退款/取消 | 代码考古 #P1 |
| **P1** | 前台订单"去支付"按钮 | orders/[id]/page.tsx 加 pending 状态 CTA | pending 用户可重试支付 | EVOLUTION C5 描述 |
| **P1** | 前台订单分页 | orders/page.tsx 改 server-side pagination | 用户订单 > 50 时分页 | 代码考古 #P1 |
| **P1** | per-account login lockout | User.loginAttempts + lockedUntil；5 次失败锁 15min | 防 credential stuffing | OTA §2 + 安全最佳实践 |

**演化循环**: 5 个 cycle（每个 feature 完成后单独 cycle，凑够 1 个审计 + 1 个 adversarial verify）

**成功指标**:
- Lighthouse > 90
- 支付成功率 > 95%
- 测试覆盖率 ≥ 70%（strategy + service）
- 0 P0 security finding（CLAUDE.md §8 protocol）

**风险**:
- 支付集成涉及 PCI-DSS — 用 Stripe 托管，**不碰卡号**
- 退款引擎状态机复杂 — 先 V1 简单规则（未使用全额退 + 已使用部分退），复杂阶梯退到 v1.1

---

### Phase 2 · v1.1 增长引擎

**周期**: 6-8 周
**目标**: 搜索 / 推荐 / 营销驱动 DAU
**入口条件**: v1.0 已上线稳定运行 ≥ 2 周

| 优先级 | 功能 | 主要任务 | 验收标准 | 来源 |
| --- | --- | --- | --- | --- |
| **P1** | 优惠券系统 | `Coupon` model + `/api/coupons` CRUD + 订单页叠加规则 | 平台券 / 商家券可叠加；满减门槛生效 | OTA §2.6 + 美团 §1.5 |
| **P1** | 满减 / 秒杀活动 | `Promotion` model + 时间窗口 + 限购 | 秒杀商品 5 分钟内售罄 | 美团 §1.5 |
| **P1** | 凭证改期 / 换人 | `OrderService.rescheduleOrder` + UI | 用户可自助改期 1 次（免手续费） | Klook §3 + OTA §2.4 |
| **P1** | Apple Wallet / PWA Pass | voucher 加 `pkpass` 生成；`passkit-generator` 库 | iOS 用户可"添加到 Wallet" | Klook §3 + Tiqets |
| **P1** | CMS 库存预占 + 释放 | `InventoryHold` model + 15 分钟 TTL | 下单锁库；超时自动释放 | OTA §2.1 #4 |
| **P1** | InventoryHold 用库存预占解决"两人同时下单" | OrderService.createOrder 用 hold 替直接扣减 | 用户 A 持锁时用户 B 看到"库存不足" | OTA §2.1 #4 |
| **P1** | text index 替代 regex 搜索 | Product.text 已建 → lib/utils/pagination.ts:63 改 $text | `?q=故宫` 走 text query | EVOLUTION C5 遗留 |
| **P2** | VIP 价 / 会员价 | `User.membershipTier` + Product.memberPriceInCents | 普通用户看不到 memberPrice；VIP 看到 | OTA §2.6 #39 |
| **P2** | Affiliate 推广员 | `Affiliate` model + 推广链接 + 佣金结算 | 推广员 A 带来的订单产生 5% 佣金 | OTA §2.6 #41 |
| **P2** | 推荐系统 v0（基于销量 + 类目） | 首页"同类目热销" + 详情页"看了又看" | CTR > 5% | Klook §2.2 #17 |

**演化循环**: 5 个 cycle（搜索 / 推荐 / 券系统 三大块各 1-2 cycle）

**成功指标**:
- 搜索转化率 > 8%
- 营销活动 ROI > 3
- 改期率 < 5%（说明用户首次决策更准确）
- 测试覆盖率 ≥ 80%（API E2E 70% 覆盖）

**风险**:
- 优惠券叠加规则容易出 bug — 先简化"互斥 OR 叠加"，阶梯放 v1.2
- Apple Wallet 集成需要 macOS 开发机 — CI 用 skip-only-PKPass-Apple 标记

---

### Phase 3 · v1.2 稳定性 + 体验

**周期**: 4 周
**目标**: p95 list < 200ms；99.9% SLA 准备
**入口条件**: v1.1 上线稳定运行 ≥ 4 周

| 优先级 | 功能 | 主要任务 | 验收标准 | 来源 |
| --- | --- | --- | --- | --- |
| **P0** | Cache 升级到 Redis | `lib/cache.ts` 接口不变，实现换 Redis | cache miss latency < 5ms | CLAUDE.md §6 v1 触发 |
| **P0** | Worker queue（BullMQ） | 订单确认 / voucher 生成 / 退款异步化 | 下单返回 < 200ms；voucher 生成不阻塞响应 | CLAUDE.md §6 v1 |
| **P0** | 测试覆盖率 ≥ 85% | Playwright E2E 关键路径 | 注册→下单→支付→核销 全跑通 | EVOLUTION §2 标注 |
| **P1** | bcryptjs → scrypt/argon2id | `lib/auth/password.ts` 升级 | hash time > 100ms；NIST 推荐 | CLAUDE.md §5 |
| **P1** | X-Idempotency-Key for Order create | `Idempotency-Key` header + 24h 去重表 | 重复请求不创建重复订单 | EVOLUTION C4 标记 |
| **P1** | 全球 IP-based token bucket middleware | `middleware.ts` 加 IP-only limiter | 401 flood 被打掉；不影响登录用户 | EVOLUTION C10 v1.0 |
| **P2** | Phase 7 logger | 替换 console.error/warn | Sentry / pino 结构化日志 | EVOLUTION C10 v1.4 |
| **P2** | CDN 部署前 Vary:Cookie 端到端验证 | staging 部署 Vercel Edge | 不同 cookie 拿不同响应 | EVOLUTION C9 + C10 |
| **P2** | PricingContext 提取 | `lib/strategies/types.ts` PricingContext 抽离重复 | strategy 共享定价上下文 | EVOLUTION C10 v1.3 |
| **P2** | 6 处 `<img>` → `next/image` | 全工程替换 | build warning = 0 | EVOLUTION C5 起 |

**演化循环**: 3 个 cycle（Redis 迁移 / 异步化 / a11y）

**成功指标**:
- p95 list < 200ms（CLAUDE.md §6 v1 触发条件）
- 99.9% SLA
- 0 🔴 / 0 🟡 跨 2 个连续 cycle

**风险**:
- Redis 迁移有数据迁移窗口 — 双写 + 一致性校验
- Worker queue 引入最终一致性 — UI 要明确"处理中"状态

---

### Phase 4 · v2.0 平台化

**周期**: 8 周+
**目标**: 多商家入驻；开放 API；多语言
**入口条件**: DAU > 10k 或团队 > 5 工程师（CLAUDE.md §6 vN）

| 优先级 | 功能 | 主要任务 | 验收标准 | 来源 |
| --- | --- | --- | --- | --- |
| **P0** | 多商家入驻 | Merchant model + 入驻审核流 + 分账 | 商家 A/B/C 独立运营；平台抽佣 | OTA §2.7 + CLAUDE.md §6 |
| **P0** | 开放 API（OAuth 2.0） | `/api/oauth/*` + 速率限制 + 文档 | 第三方能接入；webhook 推送订单 | OTA §2.5 |
| **P1** | i18n（zh-CN/en-US/ja-JP） | next-intl 接入；voucher 多语言 | 切换语言 UI 全跟随 | Klook §2.2 |
| **P1** | 多币种 + 本地支付 | 货币模型 + 汇率服务 | USD/EUR/JPY 可下单 | Klook §2.2 |
| **P2** | 内容审核工作流 | Draft → PendingReview → Published 状态机 | 商家提交后 staff 审核 | C10 v1.5 |
| **P2** | AI 行程规划（v0） | LLM 接入；输入目的地 + 天数 → 推荐组合 | 用户可"加入购物车"一键下单 | Klook §2.2 #21 |
| **P3** | Split CMS（CLAUDE.md §6 vN） | app/cms + app/api 提取到独立 Next.js 项目 | 两个独立 deploy；shared types | CLAUDE.md §6 vN |

**演化循环**: 5-10 个 cycle（平台化每个子模块都需独立 cycle）

**成功指标**:
- 商家自助上线 < 30 分钟
- API 接入文档完整；第 3 方能 1 天接入
- 3 种语言 UI 全跟随

**风险**:
- 多商家 = 多租户 — 数据隔离 + RBAC 加倍
- 开放 API = 稳定性承诺 — versioning 必须从 v1 就规划

---

## 4. 测试基建轨道（贯穿 v1.0-v1.2）

> **重要性**: v0 0% 测试是**商业部署的 ship blocker**。CLAUDE.md §2 标记"Tests: (TBD — add Vitest when iteration count > 5)"——已远超 5 个 cycle。

### v1.0 测试里程碑
- **Vitest 配置 + 单测覆盖**:
  - 5 个 strategy 边界 100%
  - OrderService payOrder / cancelOrder 100%
  - CartService 边界 80%
  - Zod schema 全覆盖（拒绝非法输入）
- **目标覆盖率**: 70%

### v1.1 测试里程碑
- **API E2E（Playwright）**:
  - 注册 → 登录 → 加车 → 下单 → 支付 → 核销 → 退款（mock 支付）
  - CMS 商品 CRUD → 前台可见
  - 鉴权 / 限流 / CSRF 拦截用例
- **目标覆盖率**: 80%

### v1.2 测试里程碑
- **性能基准**（k6 / autocannon）:
  - p50 / p95 / p99 列表响应时间
  - 并发用户模拟
- **监控**（Phase 7 logger 接入）：
  - Sentry 错误聚合
  - 关键路径埋点

---

## 5. 风险与缓解

| # | 风险 | 影响 | 缓解 |
| --- | --- | --- | --- |
| 1 | **支付集成涉及 PCI-DSS** | 🔴 法律风险 | 用 Stripe / Adyen 托管，**不碰卡号** |
| 2 | **退款引擎状态机复杂** | 🟡 边界 bug 多 | v1.0 简化为"未使用全额 + 已使用部分"；v1.1 再加阶梯式 |
| 3 | **CMS 表单仍走 fetch 而非 Server Action** | 🟡 不符合 CLAUDE.md §3.2 偏好 | v1.1 渐进迁移；不强制全量改 |
| 4 | **Redis 迁移数据一致性** | 🟡 双写期可能丢更新 | 双写 + 周期性 reconcile 脚本 |
| 5 | **Worker queue 引入最终一致性** | 🟡 用户看到"处理中"时间长 | UI 明确状态 + webhook 推送 |
| 6 | **多商家 = 数据隔离 + RBAC 加倍** | 🔴 安全风险 | merchantId 加到所有查询；自动化测试覆盖越权 |
| 7 | **AI 行程规划幻觉** | 🟡 用户体验差 | v0 仅作"推荐"而非"自动下单"；人类决策点保留 |
| 8 | **C9+C10 14 个文件未 commit** | 🟡 流程缺陷 | v1.0 上线前必须 commit 当前全部改动 |

---

## 6. 资源估算

| 项目 | 团队规模 | 周期 | 月成本（人天×单价） |
| --- | --- | --- | --- |
| v1.0 商业可用最小集 | 2-3 工程师 | 4-6 周 | ~ 80-120 万 CNY |
| v1.1 增长引擎 | 2-3 工程师 | 6-8 周 | ~ 120-160 万 CNY |
| v1.2 稳定性 + 体验 | 2 工程师 | 4 周 | ~ 40-60 万 CNY |
| v2.0 平台化 | 3-5 工程师 | 8 周+ | ~ 200-300 万 CNY |
| **总计** | | **22-26 周** | **~ 440-640 万 CNY** |

**成本中心**（非人力）:
- Stripe 费率: 2.9% + 0.3 USD/笔
- 微信支付 / 支付宝费率: 0.6% - 1.0%
- Redis (Upstash): 50-200 USD/月
- BullMQ (Upstash Redis): 同上
- Sentry: 26-80 USD/月
- CDN (Cloudflare/Vercel): 0-200 USD/月

---

## 7. 关键决策点（已确认 → 见 §9）

> 这些决策影响 v1.0 范围，启动前需明确。**已通过 AskUserQuestion 确认**，详见 §9。

| # | 决策点 | 选项 | 推荐 |
| --- | --- | --- | --- |
| **D1** | **支付优先级** | A. 国际优先（Stripe）<br>B. 国内优先（微信 + 支付宝）<br>C. 双轨 | **A 国际优先（Stripe）** |
| **D2** | **差异化锚点** | A. 做"履约承诺型会员"<br>B. 不做会员体系，纯走产品深度<br>C. 做"履约担保"无会员 | **B 纯走产品深度** |
| **D3** | **退款政策复杂度** | A. 简单规则<br>B. 阶梯式<br>C. 商家自定义 | **A 简单规则** |
| **D4** | **v1.0 启动前 commit 流程** | A. 先 commit C9+C10<br>B. 合并 commit<br>C. 丢弃重写 | **A 先 commit** |
| **D5** | **CMS 迁 Server Actions** | A. 渐进迁移<br>B. 全量重写<br>C. 维持 fetch POST | **A 渐进**——v1.1 改 CMS 商品/分类；ROADMAP 标注"非阻塞" |
| **D6** | **测试框架选型** | A. Vitest + Playwright<br>B. Jest + Cypress<br>C. Bun test + Playwright | **A**——Vitest 与 Next.js 14 + React 18 集成最好 |

---

## 8. 给后续 session 的接力棒

1. **本 ROADMAP.md 是 v0.5 → v1.0+ 的战略文件**——单 cycle 内不要尝试做完一个 phase
2. **Cycle 11 启动条件**: §10 的 3 个 atomic commit 完成 + 测试基建 Vitest 配置就绪
3. **每 phase 末尾**跑 CLAUDE.md §8 演化循环，确保无 🔴
4. **EVOLUTION.md 终止条件**已达成（C9+C10）——**新 cycle 是"功能 evolution"而非"代码审计 evolution"**，protocol 描述略需调整，建议在 CLAUDE.md §8 加 "v1.0+ Evolution Protocol: Each cycle = one feature + its audit + its deploy"

---

## 9. 决策确认与 v1.0 启动范围

> **2026-06-17 通过 AskUserQuestion 确认**——以下决策影响 v1.0 cycle 11 的具体任务边界。

### 9.1 决策摘要

| # | 决策 | 选择 | 影响 |
| --- | --- | --- | --- |
| **D1** | 支付优先级 | **Stripe（国际优先）** | v1.0 只接 Stripe SDK + Webhook；国内支付（微信 + 支付宝）延后到 v1.1 |
| **D2** | 差异化锚点 | **不做会员体系，纯走产品深度** | v1.0 / v1.1 / v2.0 不引入 User.membershipTier、订阅、月费、积分；差异化通过动态核销码、退改政策、Apple Wallet 等产品能力实现 |
| **D3** | 退款复杂度 | **简单规则（v1.0）** | v1.0 只实现"未使用全额退 + 已使用部分退"；状态机 paid → refunded / partial_refunded；阶梯式 + 商家自定义延后到 v1.1+ |
| **D4** | v1.0 启动前 commit | **先 commit C9 + C10 改动** | 14 个 working tree 文件分 3 个 atomic commit（详见 §10）；v1.0 cycle 11 在干净 baseline 启动 |

### 9.2 v1.0 范围（基于决策调整后）

**v1.0 必做（cycle 11 - cycle 15）**:
- ✅ 测试基建（Vitest + Playwright），覆盖 ≥ 70%
- ✅ Stripe 支付集成（SDK + Webhook）
- ✅ 退款简单规则（未使用全额退 + 已使用部分退）
- ✅ 动态核销码（TOTP 算法）
- ✅ staff scope to own products（merchantId）
- ✅ CMS 编辑变体/库存 + 分类 CRUD + 订单操作按钮
- ✅ 前台订单"去支付"按钮 + 分页
- ✅ per-account login lockout

**v1.0 不做（延后到 v1.1+）**:
- ⏸ 国内支付（微信 + 支付宝）— v1.1
- ⏸ 阶梯式退款 + 商家自定义退改 — v1.1
- ⏸ 会员体系 / VIP 价 / 积分 — **不做**（D2 决策）
- ⏸ 优惠券 / 满减 / 秒杀 — v1.1
- ⏸ Affiliate / 推广员 — v1.2

### 9.3 决策的连锁影响

| 决策 | 连锁影响 | 应对 |
| --- | --- | --- |
| D1 = Stripe only | 国内用户无法使用（v1.0） | 在 landing page 明确"国际版"；v1.1 加国内支付 |
| D2 = no membership | 失去"订阅收入"商业模型 | 通过"票务深度"做差异化（Apple Wallet / 即时确认率 / 退改政策） |
| D3 = simple refund | 部分用户场景不满足（出行前 24h 退订） | 在 voucher / 详情页明确退改规则；v1.1 加阶梯 |
| D4 = atomic commit | 启动 v1.0 延迟 1-2 小时 | 一次性 commit，后续 audit 起点干净 |

---

## 10. C9 + C10 commit 切分方案

> v1.0 启动前置（§9.D4 决策）——把 14 个 working tree 改动按 atomic commit 切分。

### 10.1 commit 切分（建议 3 个 atomic commit）

#### Commit 1: C9 中间件与限流硬化（`feat(middleware): C9 hardening`）
涉及 5 个文件:
- `src/middleware.ts` — Vary: Cookie 拆分公开/已鉴权
- `src/app/api/vouchers/route.ts` — rateLimit 120/min
- `src/app/api/orders/[id]/route.ts` — rateLimit 60/min
- `src/app/cms/vouchers/VoucherVerifier.tsx` — 删 dead `operator` UI
- `src/lib/services/CartService.ts` — updateCartItem 改 atomic update

#### Commit 2: C10 projection 优化（`perf(projection): C10 列表 4 处 .select()`）
涉及 4 个文件:
- `src/lib/services/ProductService.ts` — listProducts 加 .select
- `src/app/api/products/route.ts` — 投影
- `src/app/(frontend)/products/page.tsx` — 投影
- `src/app/(frontend)/page.tsx` — 投影

#### Commit 3: C10 docs + env（`docs: env doc + EVOLUTION.md C10 段落`）
涉及 5 个文件:
- `.env.example` — `CSP_IMG_HOSTS=` 占位 + 注释
- `next.config.js` — CSP 生产默认值修复
- `EVOLUTION.md` — C10 段落（叙述文档）
- 其它 Cycle 4+ 文档修订

### 10.2 commit 验证清单

每个 commit 完成后跑:
- `node_modules/.bin/tsc --noEmit` → 0 errors
- `node_modules/.bin/next lint` → 0 errors
- `node_modules/.bin/next build` → 33 routes
- 工作树状态 `git status` 干净

### 10.3 commit 后

- `git log --oneline` 应显示 4 个 commit（C8 + 3 个 atomic）+ EVOLUTION.md 顶部更新
- 进入 v1.0 cycle 11 启动条件

---

## 附录 A · 当前状态完整盘点

> 基于 2026-06-17 代码考古 agent 输出（`tsc 0 / lint 0 / build 33 routes`）

### A.1 Models 盘点（5 个 + 隐式 1 个）
- `User` 9 字段 · `Category` 7 字段 · `Product` 25+ 字段 · `Cart` 2 字段 · `Order` 14 字段 · `Voucher` 11 字段
- 关键索引全部保留；`Order` 2 个 TTL（pending / paying）

### A.2 Services 盘点（5 个）
- `ProductService` / `CartService` / `OrderService` / `UserService` / `CategoryService`
- 全部走 AppError；CartService 已含变体感知（C6）+ stock 前置（C7）+ atomic update（C9）

### A.3 Strategies 盘点（5 个）
- `SightStrategy` 100% / `ShowStrategy` 80% / `DiningStrategy` 60% / `ExperienceStrategy` 100% / `OtherStrategy` 40%
- 缺口：`ShowStrategy.validateVisitDate` / `DiningStrategy.validateVisitDate` / `OtherStrategy` 多项

### A.4 API 盘点（17 个 endpoint）
- 公开 GET: products / categories / products/[id]
- 鉴权: cart / orders / vouchers / vouchers/verify
- 管理: products POST/PUT/DELETE / categories POST
- 鉴权：withAuth 13/15 用上；withValidation 12/15 用上；rateLimit 7 处

### A.5 HOF 链使用率
- withError: 15/15 route handlers
- withAuth: 13/15
- withValidation: 12/15
- rateLimit: 7 处

### A.6 已知 dead code
- `cacheGet` / `cacheSet` / `cacheDelete` / `cacheClear` 0 处直接调用（`cacheSWR` 内部隐式用）
- 可清理但无功能影响

### A.7 CMS 不一致（CLAUDE.md §3.2 vs 实际）
- 推荐用 Server Actions — 实际全用 fetch POST
- 影响：开发体验略差（无 progressive enhancement），功能等价

---

## 附录 B · 引用资料

1. [`docs/research/ota-ticket-products-2025-2026.md`](docs/research/ota-ticket-products-2025-2026.md) — 携程/同程/飞猪 47+14 项能力清单
2. [`OTA-2025-2026-PRODUCT-REPORT.md`](OTA-2025-2026-PRODUCT-REPORT.md) — Klook/Viator/GYG/Tiqets 44+15 项能力清单
3. 美团/大众点评/抖音本地生活 — 综合研究（agent 输出，含 2025-2026 推断标注）
4. 代码考古报告 — 2026-06-17 直接读 src/ 验证 EVOLUTION.md
5. [`EVOLUTION.md`](EVOLUTION.md) — C0-C10 演化日志
6. [`CLAUDE.md`](CLAUDE.md) — 项目北极星 + 演化协议

---

*生成时间: 2026-06-17 · 基于 EVOLUTION.md (C0-C10) + 4 份并行研究*
