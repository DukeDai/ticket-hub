# TicketHub · 携程风格的票券系统

> 📜 **面向 AI / 子智能体**：请同时阅读 [`CLAUDE.md`](./CLAUDE.md)（项目北极星 + 演化协议）与 [`EVOLUTION.md`](./EVOLUTION.md)（历次审计日志）。

一个完整的票券（票务/券）单类目系统，覆盖：

- 🛒 **商品录入**：CMS 后台可视化录入/编辑
- 🎛 **CMS 管理**：分类、商品、订单、票券核销
- 🛍 **前端销售**：首页、列表、详情、购物车、结算、订单、票券列表
- 🧩 **可扩展数据结构**：`ticketType` + `attributes` + 变体/按日库存 应对景区/演出/餐饮/体验
- 🔐 **安全机制**：JWT + bcrypt + RBAC + 限流 + Zod 校验
- 🧱 **前后端分离**：Route Handlers + Server Components
- 📈 **可扩展**：连接池、索引、缓存、策略模式

> 🌀 **本项目以"演化循环"方式持续迭代**：每次循环由独立 subagent 从 correctness / performance / security 三个视角审计，然后由主会话应用修复。详见 `CLAUDE.md` 第 8 节与 `EVOLUTION.md`。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | Next.js 14 App Router + React 18 + Tailwind CSS |
| 后端 | Next.js Route Handlers + 服务层（Service）+ 中间件（withAuth / withValidation / withError / rateLimit） |
| 数据库 | MongoDB + Mongoose |
| 鉴权 | JWT（jose）+ bcryptjs |
| 校验 | Zod |
| 缓存 | 内存（SWR，可平滑切换 Redis） |
| 语言 | TypeScript（strict） |

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local：填入 MONGODB_URI / JWT_SECRET / 管理员账号

# 3. 启动本地 MongoDB（或在 .env 中指向远程实例）
# 例如：docker run -p 27017:27017 mongo:7

# 4. 初始化数据（管理员账号 + 演示商品）
npm run seed

# 5. 启动开发服务器
npm run dev
# 打开 http://localhost:3000
```

## 环境变量

复制 `.env.example` 为 `.env.local` 并填入：

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `MONGODB_URI` | ✅ | MongoDB 连接串。例：`mongodb://localhost:27017/tickets` |
| `JWT_SECRET` | ✅ | JWT 签名密钥。≥ 32 字符；长度 ≥ 64 视为 base64 |
| `NODE_ENV` | ❌ | `development` / `production` |
| `CACHE_TTL_MS` | ❌ | 商品列表缓存 TTL（毫秒），默认 30000 |
| `RATE_LIMIT_WINDOW_MS` | ❌ | 限流窗口（毫秒），默认 60000 |
| `RATE_LIMIT_MAX` | ❌ | 窗口内最大请求数，默认 10 |

> ⚠️ 启动时若 `MONGODB_URI` 或 `JWT_SECRET` 缺失，会 **fail-fast** 抛出 — 这是有意的，避免默认值上线。

## 目录结构

```
src/
├── app/
│   ├── (frontend)/          # 销售前台
│   │   ├── page.tsx
│   │   ├── products/
│   │   ├── cart/
│   │   ├── checkout/
│   │   ├── orders/
│   │   ├── login/
│   │   └── register/
│   ├── cms/                 # 管理后台
│   │   ├── page.tsx
│   │   ├── products/
│   │   ├── orders/
│   │   ├── vouchers/
│   │   └── categories/
│   └── api/                 # REST API
│       ├── auth/
│       ├── products/
│       ├── categories/
│       ├── cart/
│       ├── orders/
│       └── vouchers/
├── components/              # React 组件
│   ├── ui/                  # 基础控件
│   ├── layout/              # 站点布局
│   ├── product/
│   ├── cart/
│   ├── checkout/
│   ├── auth/
│   └── cms/
├── lib/
│   ├── auth/                # 密码、JWT、会话、守卫
│   ├── middleware/          # withAuth / withValidation / withError / rateLimit
│   ├── services/            # 业务服务层（Product / Order / Cart / User / Category）
│   ├── strategies/          # 票种策略模式（sight / show / dining / experience / other）
│   ├── utils/               # 通用工具
│   ├── validation/          # Zod 校验 schemas
│   ├── db.ts                # MongoDB 连接
│   └── cache.ts             # 缓存层
├── models/                  # Mongoose 模型
├── middleware.ts            # 全局 Next.js middleware（缓存头 / 安全头）
└── types/
    └── globals.d.ts         # CSS 等非 TS 资源的模块声明
```
```

## 数据模型概览

- **User** — 用户（user / staff / admin）
- **Category** — 分类（name / slug / ticketType / sortOrder）
- **Product** — 商品（核心）
  - `priceInCents`：用整数分存储
  - `skuVariants`：可选 SKU 变体（如演出票的"日期+价位"）
  - `dailyInventory`：景区按日独立库存
  - `attributes`：Mixed 字段承载不同票种的差异信息
  - `validFrom / validTo / validDaysAfterPurchase`：三选一/组合的"有效期"语义
- **Cart** — 一份购物车（按 userId 唯一）
- **Order** — 订单（带 productSnapshot 快照）
- **Voucher** — 凭证/票码（独立 status：active / used / expired / refunded）

## API 设计原则

| 原则 | 说明 |
| --- | --- |
| 错误统一 | 所有错误返回 `{ error: { code, message, details? } }` |
| 货币用分 | `*InCents` 整数字段，避免浮点 |
| ID 用 id | 不直接暴露 `_id`，前端只见 `id` 字段 |
| 角色化 | 写操作要求 admin/staff；越权返回 403 |
| 输入校验 | 路由入口用 Zod schema 验证 |
| 限流 | 登录/注册默认 10/min/IP |

### 主要端点

| Method | Path | 角色 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | 公开 | 注册 |
| POST | `/api/auth/login` | 公开 | 登录 |
| POST | `/api/auth/logout` | 已登录 | 退出 |
| GET | `/api/auth/me` | 公开 | 当前用户 |
| GET | `/api/products` | 公开 | 商品列表（缓存 30s） |
| GET | `/api/products/[id]` | 公开 | 商品详情（缓存 60s） |
| POST | `/api/products` | admin/staff | 新建 |
| PUT | `/api/products/[id]` | admin/staff | 编辑 |
| DELETE | `/api/products/[id]` | admin | 下架（软删） |
| GET | `/api/categories` | 公开 | 分类列表 |
| POST | `/api/categories` | admin | 新建分类 |
| GET | `/api/cart` | 已登录 | 我的购物车 |
| POST | `/api/cart` | 已登录 | 加入购物车 |
| PATCH | `/api/cart` | 已登录 | 更新数量 |
| DELETE | `/api/cart?itemId=xxx` | 已登录 | 移除 |
| GET | `/api/orders` | 已登录 | 我的订单 |
| POST | `/api/orders` | 已登录 | 下单 |
| GET | `/api/orders/[id]` | 已登录 | 订单详情 |
| POST | `/api/orders/[id]/pay` | 已登录 | 支付（mock） |
| POST | `/api/orders/[id]/cancel` | 已登录 | 取消 |
| GET | `/api/vouchers` | 已登录 | 我的票券 |
| POST | `/api/vouchers/verify` | admin/staff | 核销 |

## 扩展指南：新增一种票券类型

```ts
// src/lib/strategies/my-type.ts
import type { IProductStrategy, PricingContext, StockCheckResult, QuoteResult } from './types';

export const MyTypeStrategy: IProductStrategy = {
  ticketType: 'my-type',
  quote(ctx): QuoteResult { /* ... */ },
  checkStock(ctx): StockCheckResult { /* ... */ },
  // 可选：validateVisitDate, voucherMeta
};
```

```ts
// src/lib/strategies/registry.ts
import { MyTypeStrategy } from './my-type';
strategies['my-type'] = MyTypeStrategy;
```

并在 `src/models/Category.ts` 的 `TicketType` union、`src/lib/validation/schemas.ts` 的 `TicketType` enum 中追加即可。

## 性能与扩展

- **索引**：常见查询字段已建索引（`status+salesCount`、`categoryId+status`、`location.city+status`、`text(title,summary,description)`）
- **缓存**：列表 30s / 详情 60s `Cache-Control: public, s-maxage=…, stale-while-revalidate=…`，CDN/浏览器可直接命中
- **连接池**：mongo 连接池 2-20
- **限流**：登录/注册 10/min/IP
- **库存扣减**：使用 mongoose 原子操作（`findOneAndUpdate` + `$expr` 守卫），杜绝超卖
- **快照化**：订单里冗余 `productSnapshot`，商品改名/下架不影响历史订单

## 安全

- HttpOnly + SameSite=Lax cookie
- 强密码（≥ 8 位，含字母+数字）
- bcrypt cost=12
- 角色 RBAC（user/staff/admin）
- Zod 严格校验所有入参
- 输入长度限制（≤ 200 字符等）
- 错误信息对外不暴露堆栈

## 部署

支持 Vercel / 自托管 Node：

```bash
npm run build
npm start
```

需要：MongoDB（建议 MongoDB Atlas 或自托管集群）。

## License

MIT

---

## 演化日志

本项目以"演化循环"（Evolution Cycle）方式持续改进。完整审计与修复记录见 [`EVOLUTION.md`](./EVOLUTION.md)。**贡献前请阅读 `CLAUDE.md` 第 8 节"演化协议"。**
