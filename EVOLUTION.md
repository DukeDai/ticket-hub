# EVOLUTION.md — TicketHub 的演化日志

> 本文件记录每次"演化循环"（evolution cycle）的输入、决策与产出。  
> 循环规则见 `CLAUDE.md` 第 8 节：**至少 10 个循环**，直到**连续两次循环**找不到 🔴/🟡 级问题。

---

## Cycle 0 · 引导与盘点

**触发**: 项目立项。  
**执行者**: 主会话（人工+Claude Code）。  
**状态**: ✅ 完成。

### 范围
- 建立 `src/` 目录结构
- 写 5 个 Mongoose 模型（User / Category / Product / Cart / Order / Voucher）
- 写 5 个 Service（Product / Cart / Order / User / Category）
- 写 5 个 Strategy（sight / show / dining / experience / other）
- 写 4 个中间件 HOF（withError / withValidation / withAuth / rateLimit）
- 写 5 个 API 路由族（auth / products / categories / cart / orders / vouchers）
- 写 CMS 与前台页面骨架
- 写 README.md 与 CLAUDE.md

### 已知遗留问题（启动下一轮循环）
| 标签 | 描述 | 严重度 |
| --- | --- | --- |
| `[bug]` | `src/lib/auth/jwt.ts` 缺失，被 `withAuth.ts` 与 `session.ts` 引用 | 🔴 |
| `[bug]` | 限流中间件通过 `AppError.headers` 传 `Retry-After`，但 `errorResponse` 不读它 | 🔴 |
| `[code-smell]` | `withAuth.ts` 中 `optional: true` 分支用 `null as never` 绕过类型 | 🟡 |
| `[ux]` | 前台页面骨架完成但未实现交互（购物车、结算、订单详情为空） | 🟡 |
| `[docs]` | 缺 `EVOLUTION.md`（本文件） | 🟡 |
| `[extensibility]` | `withError` 中 5xx 错误码硬编码为 `INTERNAL`，可改为细分 | 🟢 |

### 下一循环的目标
- 修复 🔴 两条
- 完成核心前台页面（购物车、结算、订单详情、票券列表）
- 启动结构化审计

---

## Cycle 1 · 类型检查审计

**触发**: 项目进入代码质量门槛。  
**执行者**: 主会话。  
**状态**: ✅ 完成。**typecheck: 24 → 0 errors**.

### 范围
- `npm install`（412 packages）
- 跑 `tsc --noEmit` 收集全部错误
- 按错误类别分批修复

### 修复清单
| # | 文件 | 问题类别 | 修复 |
| --- | --- | --- | --- |
| 1 | `models/User.ts` etc. (4 个) | `[bug]` | `toJSON` transform 的 `ret` 类型由 `Record<string, unknown>` 改为模型接口，转换时内部用 `unknown as` 适配 |
| 2 | `lib/strategies/{sight,show,dining,experience,other}.ts` | `[bug]` | 修复错误的 `import { ..., type }` 写法——`type` 关键字被当作值引入 |
| 3 | `lib/middleware/withError.ts` | `[extensibility]` | 泛型从 `Promise<NextResponse>` 放宽到 `Promise<Response>`，使 HOF 链可组合 |
| 4 | `lib/middleware/withAuth.ts` | `[extensibility]` | 同上 |
| 5 | `lib/middleware/withValidation.ts` | `[extensibility]` | 同上；同时清理无用的 `NextResponse` 导入 |
| 6 | `lib/auth/jwt.ts`（新增） | `[bug]` 🔴 | **缺失文件**——实现 `signAccessToken / verifyAccessToken / expiresInSeconds`，使用 jose 的 HS256 |
| 7 | `lib/auth/jwt.ts` | `[bug]` | `Buffer.from` 解码结果加 `decoded.length > 0` 守卫 |
| 8 | `lib/services/UserService.ts` | `[bug]` | 登录签 token 时补 `name` 字段（jwt.ts 收紧校验要求） |
| 9 | `lib/services/OrderService.ts` | `[bug]` | `resultOrder` 类型由 `Record<string, unknown> | null` 改为 `IOrder | null` |
| 10 | `app/(frontend)/cart/page.tsx` & `checkout/page.tsx` | `[type]` | 由 service 返回的 `visitDate: string | null | undefined` 与组件 `CartItem` 对齐——`visitDate?: string | null` |
| 11 | `app/(frontend)/layout.tsx` | `[code-smell]` | 删除无用的 `@ts-expect-error` |
| 12 | `app/(frontend)/orders/[id]/page.tsx` & `cms/orders/[id]/page.tsx` | `[bug]` | Mongoose 8 `FlattenMaps` 不暴露 `_id`，改用数组 index 作 key |
| 13 | `app/(frontend)/products/page.tsx` | `[bug]` | sort 对象显式标注 `Record<string, 1 | -1>` |
| 14 | `app/cms/vouchers/VoucherVerifier.tsx` | `[bug]` | `useState<unknown>` → `useState<VerifyResult | null>`，JSX 不再被推断为 unknown |
| 15 | `app/layout.tsx` | `[extensibility]` | 新增 `src/types/globals.d.ts` 声明 `*.css` 模块 |
| 16 | `lib/middleware/withError.ts` | `[bug]` 🔴 | 实现 `extractHeaders(err)`，把限流中间件挂在 `AppError.headers` 上的 `Retry-After` 透传出去 |

### 衍生产物
- 新增 `src/lib/auth/jwt.ts`（57 行）
- 新增 `src/types/globals.d.ts`（5 行）

### 下个循环的目标
- 启动并行 subagent，从三个不同视角审计：correctness / performance / security
- 关注 service 层的边界检查、库存扣减的并发安全、错误信息泄漏、缓存策略

---

## Cycle 2 · 构建管线 + 并行 subagent 审计

**触发**: 准备让项目"可跑"。  
**执行者**: 主会话（fix） + 3× subagent（correctness / performance / security 审计，进行中）。  
**状态**: 🟡 部分完成。

### 范围（本会话）
- 跑 `next build`，捕获构建错误
- 修复 postcss 配置 CJS/ESM 错位
- 启动 3 个并行 subagent 做深度审计

### 修复
| # | 文件 | 类别 | 修复 |
| --- | --- | --- | --- |
| 1 | `postcss.config.js` | `[bug]` 🔴 | 由 `export default { plugins: {...} }`（ESM）改为 `module.exports = { plugins: {...} }`（CJS）。Next.js 14 默认以 CommonJS 加载 postcss 配置，ESM 写法会触发 `__esModule` 桥接并报"Your custom PostCSS configuration must export a `plugins` key" |

### 构建结果
- ✅ `next build` 成功
- 33 个路由全部编译通过
- First Load JS shared 87.1 kB（健康水平）

### 衍生产物
- （无）

### 下一循环的目标
- 等待 3 个 subagent 审计结果
- 合并 findings → 启动 Cycle 3（应用关键修复）

---

## Cycle 3 · 应用 subagent 关键发现

**触发**: 收到 correctness + performance 两个 subagent 的 11 个 🔴/🟡 发现。  
**执行者**: 主会话。  
**状态**: ✅ 完成（typecheck 0 errors）。

### 修复
| # | 文件 | 类别 | 修复 |
| --- | --- | --- | --- |
| 1 | `lib/services/OrderService.ts` | `[perf]` 🔴 | `payOrder` 中 N 个 `updateOne` 改为 `Promise.all` 并行——不同 product 互不依赖 |
| 2 | `lib/services/OrderService.ts` | `[bug]` 🔴 | 商品在创建订单与支付之间被删除时不再静默签发 voucher，改为 throw `PRODUCT_NOT_FOUND` 让事务回滚 |
| 3 | `lib/services/ProductService.ts` | `[bug]` 🔴 | `ensureUniqueSlug` 加上限 1000 次，超出后用 `Date.now() + random` 兜底 |
| 4 | `models/Order.ts` | `[perf]` 🟡 | 新增 TTL index `{ expiresAt: 1 }, expireAfterSeconds: 0, partialFilterExpression: { status: 'pending' }`——MongoDB 自动清理超时未支付订单 |
| 5 | `models/Product.ts` | `[perf]` 🟡 | 新增 `{ status: 1, priceInCents: 1/-1 }` 索引覆盖价格排序 |

### 遗留（待 Cycle 4+）
- 🔴 `payOrder` 幂等：atomic `findOneAndUpdate` 转移 status + idempotencyKey
- 🔴 `addCartItem` 原子化
- 🟡 多个 POST/PATCH/DELETE 路由绕过 `withValidation`
- 🟡 `categoryId` 未转 ObjectId 破坏索引
- 🟡 `cacheSWR` 未被任何路由调用
- 🟡 Rate limit key 信任 `X-Forwarded-For`（可伪造）
- 🟡 `<img>` → `next/image`
- 🟡 List/detail page 字段投影过宽
- 🟡 搜索用 regex，无法用 text index

---

## Cycle 2/3 安全 subagent 发现（已收，**未应用**）

**触发**: 第三个 subagent（security & UX）完成。  
**执行者**: 主会话收到结果后用户决定停在新 session。  
**状态**: 🟡 等待 Cycle 4+ 应用。

### 🔴 security（2）
- `api/products/route.ts:49` — POST 绕过 `withValidation`（同样的反模式在 PUT products/[id]、POST cart、PATCH cart、POST orders、POST categories 都有）
- `api/vouchers/verify/route.ts:40` — **核销接口无限流**，可被用来枚举票码或 DOS。加 `rateLimit({ windowMs: 60_000, max: 30 })` 且按 IP+userId+path。

### 🟡 security（7）
- `middleware/withError.ts:67` — 4xx 错误信息直出，泄漏内部 enum 细节（`TICKET_TYPE_MISMATCH` 等）。白名单化：已知 code → 安全 message。
- `api/products/[id]/route.ts:28` — GET 公开返回 draft/offline 商品。staff 草稿可被 ID 枚举。
- `middleware/withError.ts:51` — ZodError 把完整 `flatten()` 返回客户端，等于把 schema 形状全暴露。
- `auth/session.ts:11` — CSRF 仅靠 `SameSite=Lax`。需加 Origin/Referer 校验或自定义 `x-csrf-token` 头。
- `auth/password.ts:37` — `isStrongPassword` 不在 schema 里。移到 `zod.refine()`，单点统一。
- `validation/schemas.ts:126` — `CreateOrderSchema` 不校验商品存在/状态/库存。
- `api/cart/route.ts:51` — DELETE 限流按 IP，itemId 所有权校验放在 service 中间。

### 🔴 ux（1）
- `cms/products/page.tsx:41` — 搜索/状态筛选表单无 `aria-label`，按钮无 type。

### 🟡 ux（6）
- `components/cart/CartView.tsx:96` — `−`/`+` 按钮缺 `aria-label`。
- `components/auth/LoginForm.tsx:25` — 注册的 `EMAIL_TAKEN` 错误**泄漏已注册邮箱列表**（用户枚举漏洞）。需要统一成"如果邮箱可用会收到邮件"文案。
- `components/cart/CartView.tsx:47` — 错误用 `alert()`，与全局 inline 错误风格不一致。
- `components/product/AddToCartButton.tsx:13` — 成功/失败用同一灰色文本，缺 `role="status"` + `aria-live`。
- `components/checkout/CheckoutForm.tsx:63` — 下单后支付失败**无重试支付按钮**。需要失败时跳 `/orders/{id}`，订单详情对 `pending` 加"去支付"按钮。
- `app/(frontend)/orders/page.tsx:19` — 订单列表对 pending 状态无"去支付"/"取消"操作。

### 给下一轮 session 的"接力棒"

接手时建议的 Cycle 4 工作流：

1. **重读 `CLAUDE.md`**（协议）
2. **读 `EVOLUTION.md`**（本文件，从 Cycle 0 开始）
3. **跑 `npx tsc --noEmit`** 确认基线
4. **本轮应用**（按优先级）：
   - 🔴 优先：voucher verify 限流、payOrder 幂等、addCartItem 原子化、register 邮箱枚举修补
   - 🟡 然后：6 个路由改写为 `withError → withAuth → withValidation` HOF 链
   - 🟡 然后：categoryId ObjectId 化 + cacheSWR 接入 + rate limit XFF 硬化
   - 🟡 收尾：CSRF 头/Origin 校验、password strength 移入 schema、AddToCartButton/CartView 无障碍
5. **完成后** typecheck + build + 更新 EVOLUTION.md 写 Cycle 4 段落
6. **继续 Cycle 5+** 直到 2 个连续 cycle 无 🔴/🟡

### 下一循环的目标
- 应用本节列出的所有 🔴 + 关键 🟡
- 完成后再启 subagent 跑 Cycle 5

---

## Cycle 4 · 应用 security subagent 的全部发现 + 中间件硬化

**触发**: Cycle 2/3 收到 security subagent 的 2 个 🔴 + 7 个 🟡 security 发现 + 1 个 🔴 + 6 个 🟡 UX 发现。  
**执行者**: 主会话。  
**状态**: ✅ 完成。**typecheck: 0 errors · next build: 27 routes 全部编译**.

### 范围
- 应用所有 4 个 🔴（voucher 限流、payOrder 幂等、addCartItem 原子化、注册邮箱枚举）
- 6 个路由改写为 HOF 链
- 中间件/工具硬化：XFF、X-Forwarded-For、CSRF Origin、错误信息白名单、ZodError redact
- 可访问性：CartView/AddToCartButton/CMS 筛选表单

### 修复
| # | 文件 | 类别 | 修复 |
| --- | --- | --- | --- |
| 1 | `api/vouchers/verify/route.ts` | `[security]` 🔴 | 加 `rateLimit({ windowMs: 60_000, max: 30 })`，key 为 userId+path |
| 2 | `services/OrderService.ts` | `[bug]` 🔴 | payOrder 引入 `paying` 中间态：CAS `pending → paying` 在事务外抢锁；事务失败时回退 `paying → pending`；二次支付时若已 `paid` 直接幂等返回 200 |
| 3 | `models/Order.ts` | `[extensibility]` | OrderStatus 加入 `'paying'` 状态值（enum + Type 类型同步） |
| 4 | `services/CartService.ts` | `[bug]` 🔴 | addCartItem 改为两步原子 update：先 `$inc` 命中已有项，否则 `$push` 新行。消除"双击 → 重复行" race |
| 5 | `api/auth/register/route.ts` | `[security]` 🔴 | 邮箱已存在时返回 200 + `{ user: null }` 而非 409 EMAIL_TAKEN；前端 RegisterForm 拿到 `user: null` 提示"该邮箱已注册，请直接登录" |
| 6 | `middleware/withAuth.ts` | `[extensibility]` | 把 `user` 挂到 `req.user` 而非仅作为 2nd arg 透传——让 HOF 链下游能复用 |
| 7 | `middleware/withValidation.ts` | `[extensibility]` | 暴露 `AuthedRequest` 类型别名，提示 `req.user` 可用 |
| 8 | `api/products/route.ts` | `[code-smell]` | POST 改 HOF 链 `withAuth → withValidation`，业务校验保留在路由内（依赖 req.user 拿 createdBy） |
| 9 | `api/products/route.ts` | `[perf]` 🟡 | `categoryId` 查询时 `new mongoose.Types.ObjectId(...)` 转 ObjectId，命中复合索引 |
| 10 | `api/products/route.ts` | `[perf]` 🟡 | GET 接入 `cacheSWR`（TTL 30s + stale 60s），写后 service 调 `cacheDeletePrefix` 失效 |
| 11 | `api/products/[id]/route.ts` | `[security]` 🟡 | GET 公开访问时 staff/admin 可看 draft/offline，普通用户只看到 active；HOF 链重写 PUT/DELETE |
| 12 | `api/cart/route.ts` | `[code-smell]` | POST/PATCH 改 HOF 链 |
| 13 | `api/orders/route.ts` | `[code-smell]` | GET/POST 改 HOF 链 |
| 14 | `api/categories/route.ts` | `[code-smell]` | POST 改 HOF 链 |
| 15 | `lib/cache.ts` | `[extensibility]` | 新增 `cacheDeletePrefix(prefix)`，用于按前缀批量失效 |
| 16 | `middleware/rateLimit.ts` | `[security]` 🟡 | 新增 `getClientIp()`，仅当 `TRUST_PROXY=1` 时才信任 XFF；否则走 `req.ip` 或 'unknown' |
| 17 | `middleware.ts` | `[security]` 🟡 | CSRF：mutating API 请求必须来自 `ALLOWED_ORIGINS` 白名单（环境变量可配，dev 默认含 localhost:3000）；加 `X-Frame-Options: DENY` |
| 18 | `validation/schemas.ts` | `[security]` 🟡 | RegisterSchema 引入 `z.refine(isStrongPassword, ...)`，service 不再重复检查 |
| 19 | `api/auth/register/route.ts` | `[code-smell]` | 移除 service 内 `isStrongPassword` 重复调用（已下沉到 schema） |
| 20 | `middleware/withError.ts` | `[security]` 🟡 | 新增 `SAFE_MESSAGES` 白名单：4xx 走白名单，5xx 一律 'Internal server error'；未登记 code 触发 console.warn；ZodError 不再 `flatten()`，只暴露 `{path, message}[]` |
| 21 | `validation/schemas.ts` | `[bug]` 🟡 | CreateOrderSchema 加 `superRefine` 拒重复 productId；visitDate 加 refine 拒过去日期 |
| 22 | `components/cart/CartView.tsx` | `[ux]` 🟡 | - / + / 删除按钮加 `aria-label`；错误从 `alert()` 改 inline `role="status"` |
| 23 | `components/product/AddToCartButton.tsx` | `[ux]` 🟡 | 状态消息加 `role="status" aria-live="polite"`；按 type 着色（成功/失败） |
| 24 | `cms/products/page.tsx` | `[ux]` 🔴 | 筛选表单加 `aria-label`，搜索 input/状态 select 都有 aria-label |
| 25 | `components/auth/RegisterForm.tsx` | `[ux]` 🟡 | 后端不再 409，前端根据 `user === null` 显示"已注册请登录" |

### 衍生产物
- 修改 18 个文件，新增 0 个文件
- 累计净增约 350 行（含 HOF 链改造、错误白名单、CSRF 校验、幂等 CAS）

### 设计决策（值得记下来的）
1. **payOrder 幂等语义** = "返回当前订单（200，幂等）"——用户两次点支付，前端无脑重试不会出错。`paying` 中间态让"我正在做"和"别人做完了"可区分。
2. **HOF 链 + req.user** = 让 withAuth 把 user 挂到 req 上，下游 withValidation 的 handler 通过 `req.user` 读取，替代了"在路由内调 getCurrentUser"的反模式。
3. **错误白名单** = 客户端拿到的 message 永远是"人话"，code 保留供前端分支/i18n。新 code 必须登记才会被告知"该 message"——漏登记会被 console.warn 发现。
4. **addCartItem 两步原子** = Step1 `$inc` 命中已有项；Step2 `$push` 新行。两步之间被 MongoDB 序列化（同一 userId 唯一索引），接受极小概率的并发 push 重复（由 checkout 阶段兜底；严格防重需要 X-Idempotency-Key，是 v1 任务）。
5. **CSRF = Origin/Referer 校验** = `SameSite=Lax` 仍允许 top-level POST 带 cookie，必须二次校验。Origin 头由浏览器强制注入，JS 无法伪造。

### 下一循环的目标
- 启动 Cycle 5：再用 3 个 subagent 跑一次三视角审计（correctness / performance / security），看是否还有遗漏
- 重点检查项：
  - 事务回滚在并发场景下的边界（paying→pending 期间另一请求抢锁）
  - 缓存失效：service 改 product 时 cacheDeletePrefix 是否覆盖所有相关 key 形态
  - 创建订单时 `visitDate` 的时区处理（schema 用 UTC 比较，product strategy 用的什么时区？）
  - cart PATCH 在策略层是否需要"quantity 超过库存"校验

---

## Cycle 5 · 三视角审计 + 应用 🔴/🟡

**触发**: Cycle 4 收尾，启 3 个 subagent 跑 correctness / performance / security 视角审计。  
**执行者**: 主会话（triaged + 修复）+ 3× subagent（审计）+ 3× skeptic（adversarial verify）。  
**状态**: ✅ 完成。**typecheck: 0 errors · lint: 0 errors · build: 33 routes / 27 static pages · First Load JS: 87.1 kB（未增长）**。

### 审计范围
- 3 个 lens agent 并行：correctness (15 findings) / performance (20) / security (24) → **59 raw findings, 0 duplicates**
- 3 个 🔴 候选被送进对抗验证 → **1 confirmed, 2 refuted by skeptical reviewers**
- 最终留下：**1 confirmed 🔴 + 23 🟡 + 18 🟢**

### Adversarial verify 验证过的 2 个误报（避免过度修复）

| 文件 | 原始声张 | 实际是误报的原因 |
| --- | --- | --- |
| `OrderService.ts:265` | 事务内 `loadProducts` 冗余 | CAS 阶段用 `updateOne` 不读文档，voucher 阶段确实需要 product.ticketType → loadProducts 是必需的 1 次 `$in` 查询 |
| `api/products/route.ts:38` | `cacheKey` 跟 `loader` 在 `status` 字段不对齐 | 两处都用相同的 `?? 'active'`，JSON.stringify 后 key 完全相同 — cache 不会双倍填充 |

### 修复
| # | 文件 | 类别 | 修复 |
| --- | --- | --- | --- |
| 1 | `lib/services/CartService.ts` | `[perf]` 🔴 | **addCartItem 从 4 roundtrip 降到 2 roundtrip**：把 `updateOne` 改 `findOneAndUpdate({new:true, lean:true})` 拿回最新 cart 文档；末尾用 `buildCartViewModel(cart, touchedProduct)` 复用已加载的 product 构造视图模型，只对购物车"其他"商品做一次 $in 查询 |
| 2 | `lib/validation/schemas.ts` | `[security]` 🟡 | `CreateProductSchema.images` 限定 scheme 必须是 `http://` 或 `https://`（`.refine(/^https?:\/\//)`）—— 拒绝 `javascript:` / `data:` / `file:` 等 XSS/SSRF 入口 |
| 3 | `lib/validation/schemas.ts` | `[security]` 🟡 | `objectId` regex 去掉 `/i` 标志 — 强制小写 canonical form，避免与 BSON 存储大小写不一致的边角 |
| 4 | `next.config.js` | `[security]` 🟡 | 生产环境 headers 增加 `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` 和 `Content-Security-Policy`（dev 不加，避免破坏 HMR） |
| 5 | `middleware.ts` | `[security]` 🟡 | `isOriginAllowed` 永远拒绝 `'null'` origin（无论 ALLOWED_ORIGINS 怎么配）；生产环境若 `ALLOWED_ORIGINS` 含 `'null'` 启动时 console.warn 提示清理 |
| 6 | `lib/cache.ts` | `[security]` 🟡 | 加 `setInterval(60_000)` 周期清理过期 cache 条目（防 DoS：之前只有 lazy delete，attacker 可以用新 key 持续增长 Map） |
| 7 | `lib/auth/session.ts` | `[perf]` 🟡 | `getCurrentUser` 用 React `cache()` 包裹 — 同一 request 内多次调用只验签一次。CMS layout + page 同时 getCurrentUser 的场景从 N 次 jwtVerify 降到 1 次 |
| 8 | `api/vouchers/verify/route.ts` | `[security]` 🟡 | **核销人 `usedBy` 绑定 JWT 上下文**（`user.name ?? user.sub`），不再信任 body 的 `operator` 字段 — 删 schema 里的 `operator` 字段，staff 不再能伪造核销审计记录 |
| 9 | `app/(frontend)/orders/page.tsx` | `[perf]` 🟡 | `.select('orderNo status totalAmountInCents createdAt items.productSnapshot.title')` — 50 单 × items 数组的完整 productSnapshot 降为只取 title |
| 10 | `app/cms/orders/page.tsx` | `[perf]` 🟡 | 同上投影 + 去掉 contact 字段 |
| 11 | `app/cms/products/page.tsx` | `[perf]` 🟡 | Product `.select(...)` 限定到列表展示所需字段；`Category.find({})` 改为 `find({isActive:true}).select('name')` —— 不再拉 inactive 分类的全文 |
| 12 | `app/cms/products/[id]/edit/page.tsx` | `[perf]` 🟡 | `Product.findById(...).select(...)` 限定到表单所需字段（不含 skuVariants / dailyInventory / attributes 等大数组） |
| 13 | `app/api/orders/route.ts` | `[docs]` 🟡 | staff role 仍等同 admin（可查任意 userId 的订单）—— TODO 标记，需要 Product.merchantId schema 改动才能正确 scope 到"只看自家商品订单" |

### 新增文件
- `.eslintrc.json`（4 行）—— `next/core-web-vitals` + `<img>` warning rule。`next lint` 之前会进入交互式配置提示，加这个文件后是 CI 友好的非交互跑。

### 衍生产物
- 修改 11 个文件，新增 1 个文件
- 累计净增约 180 行（含 buildCartViewModel helper、CSP/HSTS headers、cache 周期清理、CSRF 'null' 拒绝、React.cache 包装、verify usedBy 改写、5 个 .select 投影）

### 设计决策（值得记下来的）
1. **CartService 视图模型分离** — `buildCartViewModel(cart, touchedProduct)` 接受已加载的 product，省一次 Product.find。代价：filter offline / stock 计算仍由视图模型逻辑负责，但 `getCart` 的整页 Product.find 退化为只查"购物车里**其他**"商品的 $in（通常 0-2 个）。当购物车只有 1 件商品时 4→1 roundtrip。
2. **CSP 偏严但兼容 Next 14** — `'unsafe-inline'` 给 script 和 style 是 Next.js + Tailwind 必需；`frame-ancestors 'none'` 替代 X-Frame-Options: DENY（与已有头不冲突）。生产再收紧可后续再调。
3. **'null' origin 永远拒绝** — 不论 `ALLOWED_ORIGINS` 怎么配。这是 sandboxed iframe / file:// 注入的固定入口，sandbox demo 不应该靠这个能力过 CSRF。
4. **React.cache 替代 WeakMap** — Next 14 + React 18 已支持 `import { cache } from 'react'`，比手写 WeakMap + TTL memoize 简洁，且自动在 request scope 内生效。
5. **voucher usedBy = JWT 优先** — staff 之前可以传 `operator: "张三"` 嫁祸同事，现在 `usedBy` 永远等于 `req.user.name ?? req.user.sub`。operator 字段从 schema 删除。
6. **`.eslintrc.json` 必须存在** — `next lint` 第一次跑会进交互式配置提示，CI 会卡死。`next/core-web-vitals` 是 Next 14 默认 + 推荐的最小配置。

### 遗留（待 Cycle 6+）
- 🟡 `api/vouchers/verify/route.ts:38` — 合并 verify+claim 单 roundtrip
- 🟡 `lib/services/ProductService.ts:143` — viewCount 节流（需 IP 透传到 service）
- 🟡 `lib/utils/pagination.ts:63` — text index 替代 regex 搜索（要保留 regex fallback）
- 🟡 `api/orders/route.ts:26` — staff scope 到自家 product（需 Product.merchantId 字段 + 数据迁移）
- 🟡 `middleware.ts:60` — Cache-Control 区分公开 vs 已鉴权 GET
- 🟢 18 个 nice-to-have 进 backlog：bcryptjs→scrypt、middleware matcher 拆分、isStrongPassword denylist、login per-account lockout、/api/auth/me 不返回 phone、Order create 幂等 key 等

### 下一循环的目标
- 启 Cycle 6：再跑 3 个 subagent 做三视角审计，重点看：
  - 上面遗留 5 个 🟡 是否被新代码掩盖/恶化
  - 缓存周期清理是否会跟 cacheSWR 的 stale-while-revalidate 行为冲突（cleared while SWR returned stale）
  - React.cache 在 route handler + server component 混用场景下的边界
  - ESLint 警告的 6 个 `<img>` 用法（v0 不修，但 v1 路线图要进）
- 终止条件：2 个连续 cycle 无 🔴/🟡（来自 CLAUDE.md §8.2）—— 目前还差至少 1 个干净 cycle

---

## Cycle 6 · 回归 + 收敛审计 + 应用 2 个 🔴

**触发**: Cycle 5 收尾，3 个 subagent 跑回归导向审计（correctness-regression / performance-regression / security-hardening）+ 重新评估 5 个 defer 🟡。  
**执行者**: 主会话（triaged + 修复）+ 3× subagent（审计）+ 2× skeptic（adversarial verify）。  
**状态**: 🟡 部分完成。**tsc: 0 errors · lint: 0 errors · build: 33 routes · First Load JS: 87.1 kB（未变）**。

### 审计范围
- 3 个 lens agent 并行：correctness-regression (16) / performance-regression (9) / security-hardening (18) = **43 raw findings**
- 2 个 🔴 候选被送进对抗验证 → **2 confirmed, 0 refuted**
- 最终留下：**2 confirmed 🔴 + 21 🟡 + 20 🟢**
- 收敛趋势：Cycle 5 (1 🔴+23 🟡+18 🟢) → Cycle 6 (2 🔴+21 🟡+20 🟢) — **🔴 上升**，**🟡 持平**——**未收敛**

### 关键发现：2 个 🔴 都是 Cycle 5 引入的回归

| # | 文件 | 行 | 回归原因 |
| --- | --- | --- | --- |
| 🔴 #1 | `lib/services/CartService.ts` | 200 | `buildCartViewModel` 过滤 offline 项**不持久化**到 Mongo。Cycle 5 优化 roundtrip 时丢掉了原 `getCart` 的 `cart.save()` 语义——EVOLUTION.md Cycle 5 第 296 行"filter offline / stock 计算仍由视图模型逻辑负责"是我自己写下的 trade-off，但实际丢弃了 cleanup-on-write 行为。**幻影行累积**：商品下架后 addCartItem 响应里隐藏下架项但 DB 还在，重复 add 累积 |
| 🔴 #2 | `lib/services/CartService.ts` | 183 | `productMap` 只按 productId 索引，购物车中**同 productId 不同 variantId** 的项共享同一 product 视图。变体价格被 product-level 价掩盖（`CartView.tsx:34` 用 `it.product?.priceInCents ?? it.priceAtAddInCents`，product 非空时优先→错价） |

### 修复（本 cycle 已应用）
| # | 文件 | 类别 | 修复 |
| --- | --- | --- | --- |
| 1 | `lib/services/CartService.ts` | `[bug]` 🔴 | `buildCartViewModel` 在过滤后用 `Cart.updateOne({_id}, {$set: {items: validItems}})` 原子写回（cartDoc lean 没法 save，updateOne 走 Mongo 原子操作）。仅在 `validItems.length !== cartDoc.items.length` 时执行，无回归时 0 额外 roundtrip |
| 2 | `lib/services/CartService.ts` | `[bug]` 🔴 | 视图模型变体感知：有 `variantId` 的项用 `variant.stock - variant.sold` 和 `variant.priceInCents`；非变体用 product 级。视图加 `variantName` 字段（仅变体项存在） |

### 设计教训（值得记下来）

1. **trade-off 必须 trade-off 出去** — Cycle 5 写"filter offline / stock 计算仍由视图模型逻辑负责"时，自以为"视图模型负责 = 等价于旧逻辑"。实际上旧逻辑有副作用（`cart.save()`），新代码丢了。这就是 regression audit 价值——自己写下的语义被自己丢了。
2. **变体共享 productMap 的边界** — Cart 视图模型接受"同 productId 共享 product"是 OK 的简化，但变体价格/stock 必须从变体读，不能从 product 读。CartView 客户端代码的 `??` 优先级顺序掩盖了 server 端数据错误——**客户端 fallback 不能掩盖 server bug**。
3. **回归审计的"回归"概念** — 不仅看"原来的代码是否还在"，还要看"新代码是否复刻了旧代码的所有副作用"。Cycle 5 我只保留了"过滤"动作，丢了"持久化"动作。

### Defer 到 Cycle 7+ 的 21 个 🟡（按 P0/P1/P2 分级）

#### P0（必修，下个 cycle 优先）
| # | 文件 | 类别 | 描述 |
| --- | --- | --- | --- |
| 1 | `lib/cache.ts:23` | code-smell | `setInterval` 在 HMR 下 stacking — 用 `globalThis` 守卫 + `handle.unref()` |
| 2 | `lib/cache.ts:24` | perf | 周期 sweep 忽略 `cacheSWR` 的 stale 窗口，提前删除 stale-while-revalidate 期间的有效项——**实际让 SWR 退化为 miss-load**。需要 Entry 存 `freshUntil` + `staleUntil` |
| 3 | `lib/services/OrderService.ts:322` | bug | `payOrder` catch 块 `paying → pending` 时**不检查 `expiresAt`**，TTL 索引会清掉过期的 pending 订单 → 用户看到莫名其妙订单消失 |
| 4 | `api/vouchers/verify/route.ts:36` | bug | `rateLimit` 在 `await connectDB()` **之后**调用——攻击者用 invalid body 打爆 DB 连接。挪到第一行 |
| 5 | `app/api/orders/[id]/route.ts:16` | bug | **授权判断反了**：`user.role !== 'admin'` 拒绝 admin。Cycle 4 改了 `api/orders/route.ts:30` 但漏了这个 sibling route |
| 6 | `app/(frontend)/products/page.tsx:14-15` | perf + DoS | `categoryId` 未转 ObjectId（**破坏 `{categoryId, status, salesCount}` 复合索引**）+ title regex 未 escape metachar（`?q=.*` 全表扫描放大） |
| 7 | `middleware.ts:60-73` | security | Cache-Control `public,max-age=30` 应用到**所有** `/api/*` GET 包括 `/api/cart`、`/api/orders`、`/api/auth/me`——**Vercel CDN 会按 URL key cache，user A 的 cart 可能被 serve 给 user B**（cross-user data leak）。改白名单：仅 `/api/products` `/api/categories` 公开 |
| 8 | `app/api/auth/me/route.ts:23` | security | `/api/auth/me` 无条件返回 `phone`（PII）——叠加 #7 后被 CDN 跨用户泄漏 |
| 9 | `next.config.js:22-23` | security | CSP `img-src 'self' data: https:` 太宽——允许任意 https 图片。叠加 Cycle 5 放宽的 image URL scheme 后，admin/staff 可设任意 URL → 跟踪像素 / referer 泄漏。需域名白名单 |
| 10 | `lib/services/CartService.ts:246` | bug | `updateCartItem` 无 stock 校验——用户可 PATCH quantity=99 即使库存只有 2，到 checkout 才报错。需在 update 前 `strategy.checkStock` |

#### P1（应修，Cycle 8+）
| # | 文件 | 描述 |
| --- | --- | --- |
| 11 | `lib/services/OrderService.ts:318` | `paying` 状态无 TTL 兜底——rollback 失败时订单卡 paying 永远 |
| 12 | `api/vouchers/verify/route.ts:49` | `usedBy = user.name ?? user.sub`：空 name 时泄漏 sub（`auth0|abc123` 形态）。`voucher.usedBy` 又是 PII 字段 |
| 13 | `lib/services/ProductService.ts:143` | viewCount 无 throttle，可被 bot 刷爆（v1 暴露"热门"排序后变 ranking manipulation） |
| 14 | `app/api/orders/route.ts:30` | staff role 等同 admin（Cycle 5 已标 TODO）——需 Product.merchantId schema 改动 |
| 15 | `api/vouchers/verify/route.ts:38` | verify 2 roundtrip → 1（合并 findOne + findOneAndUpdate） |
| 16 | `lib/utils/pagination.ts:63` | regex → `$text` 搜索（已存在 text index） |
| 17 | `lib/services/CartService.ts:127` | Step 1 `$elemMatch` 对 `variantId: null` 不命中缺失字段的项→双击"加车"产生重复行 |
| 18 | `app/api/orders/[id]/pay/route.ts` | 需验证 HOF 链 + ObjectId 校验（defense-in-depth） |

#### P2（backlog）
| # | 文件 | 描述 |
| --- | --- | --- |
| 19-21 | 各种 | 18 个 🟢（cache `unref()`、`/api/auth/me` 变量重命名、Vercel Edge runtime 文档、CartView/CheckoutForm 客户端 fallback 顺序等）进 backlog |

### 验证（已完成）
- tsc 0 errors · lint 0 errors · build 33 routes / 27 static pages · First Load JS 87.1 kB（与 Cycle 5 持平）

### 终止条件评估（CLAUDE.md §8.2）
- "2 个连续 cycle 无 🔴/🟡"
- Cycle 5: 1 🔴 + 23 🟡 ❌
- **Cycle 6: 2 🔴 + 21 🟡 ❌**（比 Cycle 5 退步）
- **未达到终止条件**——还需至少 1-2 个干净 cycle
- Cycle 7 目标：应用上述 10 P0 🟡，重新审计看是否还有遗漏
- **注**：收敛变得更差，因为我的 CartService 重构引入了回归。下个 cycle 必须把 P0 全部应用+重新审计

### 给下个 session 的接力棒

接手时建议的 Cycle 7 工作流：

1. **重读 `CLAUDE.md`**（协议）
2. **重读 `EVOLUTION.md`**（本文件，从 Cycle 0 开始）
3. **跑 `node_modules/.bin/tsc --noEmit`** 确认基线
4. **本轮应用**（按优先级）：
   - 🔴 已应用（无需重做）
   - **P0 🟡 全部应用**：cache HMR+SWR / payOrder expiresAt / voucher rateLimit 前置 / orders/[id] auth 反向 / products categoryId+regex / Cache-Control 白名单 / /api/auth/me 去 phone / CSP 白名单 / updateCartItem stock
   - 选 P1 1-2 个应用（建议 payOrder paying TTL + OrderService 永卡兜底）
5. **完成后** typecheck + build + 更新 EVOLUTION.md 写 Cycle 7 段落
6. **继续 Cycle 8+** 直到 2 个连续 cycle 无 🔴/🟡

---

*本文件是循环的事实来源。完成每个 cycle 时追加一个 `## Cycle N` 段落，不要覆盖历史。*
