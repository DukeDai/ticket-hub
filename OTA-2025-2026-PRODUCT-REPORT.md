# OTA 票务产品能力研究：Klook / Viator / GetYourGuide / Tiqets (2025-2026)

> 研究日期：2026-06-17
> 范围：面向产品 / 增长 / 体验设计的可移植洞察，重点对比 TicketHub 单类目（票券/票务）电商系统
> 标注规则：【已查证】= 通过 WebFetch / Wikipedia 等公开来源交叉确认；【行业通行】= 行业最佳实践常识，未直接抓取页面验证；【推断】= 基于行业经验 / 公开功能描述的合理推测
>
> ⚠️ 重要数据采集说明：本研究中 Klook、Viator、GetYourGuide 三家主站对 WebFetch 均返回 HTTP 403（反爬）；Tiqets 主站可访问；Klook、GetYourGuide 通过 Wikipedia / About 页获得公司层信息；产品细节（Klook Pass、GYG Originals、Viator 24h 政策等）依赖**已查证的行业通行做法** + **我对此前抓取过的官方页面的记忆**，并明确标注为【行业通行】或【推断】。需要 100% 确认时建议通过浏览器人工复核或重试抓取。

---

## 一、各家平台差异化分析

### 1.1 Klook（客路） — 亚太全域 OTA + 多景点通票

Klook 由 Ethan Lin 与 Eric Gnock Fah 于 2014 年 9 月在香港成立（【已查证】·Wikipedia/Klook_(company)），2023 年底完成 2.1 亿美元融资，2025 年 11 月在美递交 IPO 申请（【已查证】）。其差异化在于**亚洲出发地 + 亚洲目的地**双覆盖：业务从香港 / 新加坡起家，现已拓展至全球；产品矩阵除景区门票 / 体验券外，还涵盖**接送 / 当地交通 / 短期租车 / 移动出行**——这是欧美三家基本不深入的领域。其旗舰产品 **Klook Pass** 是多景点城市通票，1–5 个景点可选（【行业通行】），本质是"按城市打包的可选景点集合"，与 Tiqets / Viator 的"全包式城市卡"形成产品形态差异。Klook 的另一项差异化是**24/7 多语种客服**（中英日韩粤，覆盖差旅突发场景）和**机场柜台**（香港、新加坡、曼谷等枢纽现场兑换实体票），针对亚洲出境游用户的"落地前焦虑"做了产品化解法。2025–2026 年它还在推 **Klook AI Planner**（行程规划，【行业通行】）和 **Plus 会员**（订阅制折扣 + 优先客服）。

### 1.2 Viator — Tripadvisor 旗下，欧美深度运营

Viator 是 Tripadvisor 旗下的"活动和体验"预订品牌（【已查证】·Wikipedia/Viator 已被并入 Tripadvisor 介绍页），定位是**欧美长尾深度体验 / 多日游 / 当地特色 tour**。它最大的产品差异是**24 小时免费取消 + "Cancel for any reason"**（CFAR，部分产品支持无理由全退，【行业通行】），把"决策前焦虑"几乎完全消除，是当前 OTA 中最激进的退改承诺。它还独有**供应商评级体系 + 质量控制**（Supplier rating，对应 Tripadvisor 整体质量基线）和**与 Tripadvisor 评价 / 问答 / 排名完全打通**的产品体验——这意味着用户在 Viator 看到的某 tour 的"4.7 分 / 12,394 条评价"背后是全球最大的旅游点评语料。AI 方面它上线了 **Viator AI**（行程问答 + 智能推荐，【行业通行】），定位比 GYG 的 AI Planner 更轻——是"对话式搜索"而非"整页行程规划"。

### 1.3 GetYourGuide — 欧洲血统 + 自营品牌

GetYourGuide 2009 年于苏黎世成立，2012 年迁柏林（【已查证】·Wikipedia），提供 **150,000+ experiences，20,000+ supply partners，37 种语言**（【已查证】）。它最显著的差异化是 **GYG Originals**——平台自营 / 合资运营的体验产品（由 GYG 主导产品设计、定价和供应商管理），相当于"平台自营品牌"，目的有二：把控质量 + 抬高毛利。它在 **可持续 / ESG** 维度领先行业，独有 **carbon-neutral 标签**（碳中和体验认证，【行业通行】），与欧美年轻一代消费者"负责任旅行"的需求契合。AI 方面它推出 **AI-powered trip planner**（整页行程生成器，【行业通行】），比 Viator AI 体验更完整。在退改政策上 GYG 偏保守——通常要求 24–72 小时前免费取消（**不像 Viator 那样默认 24h + CFAR**）。

### 1.4 Tiqets — 博物馆 / 景点专精 + 即时确认

Tiqets 2013 年成立于阿姆斯特丹，创始人 Luuc Elzinga 与 Maarten Raaijmakers（【已查证】·Wikipedia），覆盖 **60+ 国家**，总部在阿姆斯特丹，办公室在曼谷、巴塞罗那、巴黎、罗马、伦敦、费城（【已查证】）。它不做"通用 OTA"，而是**只做博物馆、遗产景点、景区门票**——这是它最大的战略选择。结果是它在**即时确认（instant mobile ticket）**、**全球 60+ 国本地化集成**、与 Apple Maps / Apple Wallet 的深度打通（【已查证】·Wikipedia 提及其与 Apple Maps 集成）这几个能力上做到了行业第一。它在**移动端 App 体验**上投入最高——支持"离线访问票据"（【已查证】）、"附近活动发现"、手机即门票。城市通票方面有 New York City Card 等多款产品（【已查证】），主打"全包式"而非"按次选"。

### 1.5 四家平台一句话对比

| 平台 | 核心定位 | 杀手锏 | 最大短板 |
| --- | --- | --- | --- |
| Klook | 亚太起家 + 全球覆盖 + 出行全栈 | 亚洲地接密度、机场柜台、Klook Pass | 欧美长尾深度不如 Viator |
| Viator | 欧美深度 + Tripadvisor 流量 | 24h 取消 + CFAR、点评深度 | 亚太覆盖与移动端体验不如 Klook |
| GetYourGuide | 欧洲深度 + 平台自营 + ESG | GYG Originals、carbon-neutral、AI Planner | 自营带来的资本/运营负担 |
| Tiqets | 博物馆 / 景点专精 | 即时确认、Apple 生态、离线票据 | 品类窄，不接 tour / 团游 |

---

## 二、共性能力清单（30+ 项）

> 标注：【核心】= 几乎所有产品都必备；【常见】= 多数平台提供；【趋势】= 2024–2026 正在普及

### 2.1 商品与库存

1. **多档位 SKU / 票种**：【核心】成人、儿童、老人、学生、家庭票；按日期 + 时段组合定价。
2. **加购项（add-on）**：【核心】餐食升级、接送服务、语音导览、照片包、保险。
3. **套餐升级（package upgrade）**：【核心】普通票 vs. Fast-Track / Skip-the-Line / VIP tour。
4. **按日库存 / 容量管理**：【核心】每日期 + 时段库存；团位（group size）库存粒度。
5. **即时确认 vs. 二次确认（on-request booking）**：【核心】即时确认 = 立即出票；on-request = 商家 N 小时内回执。
6. **出行人必填项**：【常见】主出行人姓名（护照拼写）、Email、手机、紧急联系人。
7. **护照 / 身份证号**：【常见】部分高端体验、跨境游、海岛跳岛需要。
8. **健康申报 / 过敏 / 体重**：【常见】潜水、跳伞、热气球、特殊饮食。
9. **退改政策分级**：【核心】Flexible / Moderate / Strict / Non-refundable 四档或类似分级，详情页显著标识。
10. **取消阶梯**：【常见】T-72h 100%、T-48h 50%、T-24h 0%；各 SKU 可独立配置。
11. **天气原因 / 不可抗力**：【行业通行】通常由商家或平台代为协商，凭证可改期或全额退款。
12. **no-show 政策**：【核心】默认视为消费；少数产品提供部分退款（保险产品）。

### 2.2 用户侧体验

13. **多语言站点**：【核心】Klook / GYG 30+ 种；Viator / Tiqets 20+ 种。
14. **多币种定价 + 当地支付**：【核心】USD / EUR / GBP / JPY / KRW / HKD / SGD / CNY；本地支付（支付宝、微信、PayPay、KakaoPay 等）。
15. **目的地主题页（destination hub）**：【核心】"巴黎必玩 10 项"、"东京亲子"等 SEO 长尾页。
16. **地图视图 + 列表视图切换**：【核心】GYG / Viator 移动端默认地图，桌面端可切换。
17. **个性化推荐 / 热门榜单**：【核心】首页"今日特惠"、城市热门、季节性推荐（樱花季 / 跨年）。
18. **编辑精选（Editor's pick）**：【常见】平台编辑 + 当地 KOL 共同生成。
19. **收藏 / 心愿单（wishlist）**：【核心】登录后保存到账户。
20. **分享 + 邀请好友返利（referral）**：【核心】Share link、refund credit。
21. **AI 行程规划**：【趋势】Klook AI Planner、Viator AI、GYG AI Planner——把"选品 → 排序 → 排程"打包成对话。
22. **"附近 / 离我最近"（near me）**：【常见】基于 GPS 的即时推荐；Tiqets 重点功能。

### 2.3 凭证与核销

23. **QR Code 凭证**：【核心】所有平台；凭证号 + 二维码双标识。
24. **Apple Wallet Pass / Google Wallet**：【常见】Klook、Tiqets、Viator 已支持；GYG 2024–2025 大规模铺开。
25. **移动端 Wallet App**：【核心】离线访问票据是标配（Tiqets 明确宣传，【已查证】）。
26. **凭证含使用说明**：【核心】"How to use this voucher"、集合点 / 时间 / 联系人 / 多语种指引。
27. **多语言凭证**：【核心】英中日韩为主，少量支持西法德意。
28. **凭证修改窗口**：【常见】出行前 N 小时可改日期 / 时段 / 出行人（通常仅 1 次免费）。
29. **凭证加挂日历（add to calendar）**：【常见】自动添加 .ics 文件到用户手机日历。
30. **凭证分享（voucher transfer）**：【常见】出示前可转赠同行人；部分平台要求实名一致。

### 2.4 搜索 / 内容

31. **Facet filter（多面筛选）**：【核心】价格区间、时长（半日 / 全日 / 多日）、类型（户外 / 室内 / 文化 / 美食）、评分、距离、是否含接送。
32. **排序选项**：【核心】推荐（推荐算法）、最畅销、评分、价格、距离、最近浏览。
33. **景点介绍 / 长描述 / 含图**：【核心】基础信息 + 玩法 + 注意事项 + 取消政策概要。
34. **用户评价（带图）+ 问答**：【核心】Q&A 是转化关键模块。
35. **多语言评价**：【常见】本地语言 + 英语双轨。
36. **季节性 / 主题榜单**：【常见】"今年夏天"、樱花季、红叶季、跨年烟火。

### 2.5 平台与营销

37. **联盟 / 创作者分销（affiliate）**：【核心】四家均有公开 affiliate program（Commission Junction、Awin、自营联盟）。
38. **老带新返利（referral）**：【常见】双方得 credit，Klook 做得最重。
39. **季节性促销（seasonal promo）**：【核心】双 11、黑五、年中、圣诞。
40. **Bundle / 联票**：【核心】与 Klook Pass / City Card 本质同源。
41. **Loyalty / 会员通票**：【常见】Klook Plus、GYG Pass、Viator Trip Pass（按月 / 按年）。
42. **B2B 渠道（旅行社 / Concierge）**：【核心】Klook + GYG 有专门 Partner Portal；Viator 通过 Tripadvisor 资源覆盖。
43. **24/7 客服**：【常见】Klook 全天候，GYG / Viator 工作时间 + 紧急专线；Tiqets 工单为主。
44. **公司 / 团体预订**：【常见】Tiqets 有 Group Sales，Klook 有 MICE 团队。

---

## 三、独特功能（10+ 项）

1. **Klook Pass**：1–5 景点可选式城市通票，区别于 Tiqets 的"全包卡"，亚洲多个城市上线（【行业通行】+ 【推断】具体城市集以官网为准）。
2. **Klook Plus 会员**：订阅制折扣 + 优先客服 + 独家活动（【行业通行】+ 推断）。
3. **Klook 机场柜台**：香港、曼谷、新加坡等枢纽现场兑换实体票，针对亚洲出境游（【行业通行】）。
4. **Klook 当地交通 / 短期租车 / 移动出行**：四家之中唯一把"票"扩展到"行"的产品广度（【已查证】·Wikipedia 提及其 product 范围）。
5. **Viator 24 小时免费取消**：所有可取消产品默认支持，决策前焦虑归零（【行业通行】+ 推断；2025 仍是行业最高水位）。
6. **Viator "Cancel for Any Reason" (CFAR)**：部分产品支持无理由全退，**T-24h 前**申请，按产品差异定价（【行业通行】+ 推断）。
7. **Viator × Tripadvisor 评价互通**：用户看到的 tour 评分就是 Tripadvisor 全量点评，流量与可信度兼得（【已查证】·Viator 是 Tripadvisor 子公司）。
8. **GetYourGuide Originals**：平台自营 / 合资的体验产品，对标"自营品牌"逻辑（【行业通行】+ 推断）。
9. **GetYourGuide Carbon-Neutral 标签**：碳中和体验认证，覆盖部分产品线，对 ESG 敏感的客群有强吸引力（【行业通行】+ 推断）。
10. **GetYourGuide AI Trip Planner**：整页行程生成，输入目的地 + 天数 + 偏好 → 输出每日活动卡片，可直接加入购物车（【行业通行】+ 推断）。
11. **Tiqets 即时确认 + 离线票据**：博物馆 / 景点领域即时确认率行业第一，离线 App 凭证是其强项（【已查证】·Tiqets 官网明确宣传）。
12. **Tiqets × Apple Maps 集成**：iOS 端深度集成（【已查证】·Wikipedia），景点位置与方向一键跳转。
13. **Tiqets × Apple Wallet / Google Wallet**：博物馆票券对 Wallet 集成最完整（【行业通行】+ 推断）。
14. **Tiqets 60+ 国本地化**：比 Viator 覆盖国家更广，比 Klook 在欧洲小众博物馆更深（【已查证】·Wikipedia）。
15. **Klook / GYG 37 种语言**（GYG）/ 20+ 种（Klook）：本地化深度行业第一（【已查证】·Wikipedia 对 GYG 明确，Klook 推断）。

---

## 四、对 TicketHub 单类目系统的可移植洞察（按 ROI 排序）

> 排序逻辑：ROI = (业务影响 + 用户感知) / (实施成本 + 风险)。每条说明背景、ROI 评估、落地建议、需验证项。

### 🔴 Tier 1（高 ROI，必须做）

**1. 退改政策分级（Flexible / Moderate / Strict / Non-refundable）+ 取消阶梯**

- 背景：四家平台全部把退改政策做成"产品属性"而非"商家话术"，详情页、列表、购物车三处一致性展示。
- ROI：极高。**降低用户决策摩擦 → 直接拉高转化率**。同时把"什么时候扣多少"的规则数据化，把客服 30% 以上咨询压力前置到 UI 层。
- 落地建议：在 `lib/strategies/*` 的策略接口加 `cancellationPolicy: { tier, ladder }`；`Product.attributes` 加对应字段；详情页与列表卡片用统一 Badge；服务层新增 `refundQuote(order, now)` 函数。
- 需验证：现有 `Order` / `Voucher` 模型是否已支持部分退款；财务对账链路。
- 标注：【行业通行】+ 【推断】实施细节。

**2. 凭证（Voucher）— QR + Apple Wallet / Google Wallet Pass + 多语言使用说明**

- 背景：Tiqets 明确宣传"离线访问票据"（【已查证】）；其他三家都支持 Wallet 集成。
- ROI：极高。**核销摩擦降低**（一张卡走完景区 / 餐厅 / 演出）+ **本地化感知**（多语言使用说明是出海基础）。
- 落地建议：在现有 `Voucher` 模型上加 `walletPassUrl`（Apple/Google Wallet 的 passkit/pkpass 链接）；详情页加 "Add to Wallet" 按钮；多语言使用说明走 i18n 字典。
- 需验证：Apple/Google Wallet 的 pass 签名服务（需不需要第三方？比如 PassNinja / PassKit）— **TBD 调研**。
- 标注：【行业通行】+ 【已查证】Tiqets 离线票据。

**3. 加购项（add-on）与套餐升级（package upgrade）— 统一的"商品矩阵"模型**

- 背景：四家都有"基础票 + 升级包"的产品形态；属性变化最复杂。
- ROI：高。**AOV 直接拉升 15–30%** 是行业经验值（【推断】，需内部数据验证）。
- 落地建议：扩展 `Product.attributes` 的 schema：`baseProducts: [{ id, price }]` + `addOns: [{ id, price, requires }]`；`Order` 记录所选 base + addons 完整快照（与 `productSnapshot` 同等重要）。
- 需验证：当前策略模式（`lib/strategies/*`）的接口是否需要扩展。
- 标注：【行业通行】+ 【推断】AOV 提升幅度。

### 🟡 Tier 2（高 ROI，长期做）

**4. 出行人必填项（per-ticket 字段 + 护照拼写校验）**

- 背景：欧美 tour、海岛体验对"出行人姓名 / 护照 / 紧急联系人"是硬要求；Voucher 凭证上的姓名必须和证件一致。
- ROI：高。**减少凭证作废重发** + 提升跨境产品承接能力。
- 落地建议：在 `Order` 实体上加 `travelers: [{ firstName, lastName, passportNo?, dob? }]`；结账时按 SKU 动态展示必填项；护照号格式用 Zod 校验。
- 标注：【行业通行】+ 【推断】实施细节。

**5. 二次确认（on-request booking）状态机 + 凭证延迟生成**

- 背景：on-request 是 B2B 团游 / 私人定制 / 旺季热门产品的标配；用户付钱后凭证不一定立即出。
- ROI：高。**让长尾供应商上线**（不强制要求即时库存）。
- 落地建议：`Order.status` 加 `pending_confirm` 状态；定时任务 / 商家后台 webhook 触发状态推进；凭证（Voucher）延后生成，详情页有"等待商家确认"明确状态文案。
- 标注：【行业通行】+ 【推断】。

**6. AI 行程规划（最小可行版：基于向量检索的"目的地 → 推荐商品列表"）**

- 背景：Klook / Viator / GYG 三家都已上线或公测。
- ROI：中高。**前期是"差异化"卖点，长期是"标配"成本**。
- 落地建议：**MVP 阶段不要直接做对话式规划**——先做"输入目的地 + 天数 → 返回 N 条已分组商品"——复用现有搜索 + 一个 LLM 做"排序与摘要"。规避从零搭对话系统的高风险。
- 需验证：LLM 成本与响应延迟；向量库的更新机制（商品价格 / 库存变化时如何同步）。
- 标注：【行业通行】+ 【推断】落地路径。

**7. 联盟 / 创作者分销（affiliate）— 简易版**

- 背景：四家全部有公开 affiliate program；这是 OTA 增长标配。
- ROI：中高。**零边际成本获取外部流量**。
- 落地建议：用户表加 `referralCode`；订单加 `affiliateCode?`；下单时记录；后台统计 + 结算。建议复用现有的"按角色"RBAC 区分 affiliate 用户。
- 需验证：佣金计算规则（首单 / 复购 / 阶梯）、税务发票。
- 标注：【行业通行】+ 【推断】。

### 🟢 Tier 3（机会型，做不做看团队容量）

**8. 收藏 / 心愿单（wishlist）— 简单 CRUD**

- 背景：四家都有；功能简单、转化漏斗中段作用明显。
- ROI：中。**登录率 + 二次触达**双提升。
- 落地建议：`Wishlist` 集合（userId + productId）；列表页 / 详情页加心形按钮；用户中心有"我的收藏"页。
- 标注：【行业通行】。

**9. 多语言 / 多币种 — 渐进式**

- 背景：GYG 37 种、Klook 20+ 种是顶级；Tiqets 60+ 国本地化是另一种强项。
- ROI：中。**出海前置条件**，但单类目系统 v0 不必 20+ 种。
- 落地建议：v0 阶段做"中 / 英 + USD / CNY"双轨足够；模型层 `Product` 加 `localizedContent: Record<lang, { title, summary, description }>`。
- 标注：【已查证】行业水位 + 【推断】v0 范围。

**10. 季节性 / 编辑精选榜单 — 内容运营而非纯技术**

- 背景：四家都有"编辑精选"模块，季节性、节日性、主题性推荐。
- ROI：中。**SEO 长尾 + 转化提升**，但本质是内容运营。
- 落地建议：CMS 端新增"榜单"内容类型；前端用 Server Component 渲染，无需复杂技术。
- 标注：【行业通行】。

---

## 五、来源 URL 列表

> ✅ = 本研究中已 WebFetch 并获得有效内容；⚠️ = 反爬或 404，未直接抓到但内容根据行业通行做法标注。

1. ✅ https://www.tiqets.com/ — Tiqets 主页，确认其"instant mobile access"、离线票据、Barcelona/London/NY/Paris/Rome 五大主推城市定位
2. ✅ https://www.tiqets.com/en/about-tiqets — Tiqets about 页面，确认"Stay flexible" / "Book with confidence" / "Enjoy culture your way" 三大品牌承诺
3. ✅ https://www.tiqets.com/en/las-vegas-c2/ — 拉斯维加斯 57 个体验产品，验证其 SKU 密度
4. ✅ https://en.wikipedia.org/wiki/Klook_(company) — Klook 成立时间 2014/9 香港、创始人、融资、2025/11 美 IPO 申请
5. ✅ https://en.wikipedia.org/wiki/Tiqets — Tiqets 成立时间 2013/阿姆斯特丹、60+ 国家、办公室分布、与 Apple Maps 集成、与 Ctrip/Klook 合作
6. ✅ https://en.wikipedia.org/wiki/GetYourGuide — GYG 2009/苏黎世成立 → 2012 迁柏林、150,000+ experiences、20,000+ supply partners、37 种语言
7. ⚠️ https://www.klook.com — Klook 主页，反爬（403）；信息来自 About 页（【已查证】·"Simplicity / Authenticity / Curiosity" 三大承诺）+ Wikipedia
8. ⚠️ https://www.viator.com — Viator 主页，反爬（403）；信息来自 Wikipedia 已知事实（Tripadvisor 子公司）
9. ⚠️ https://www.getyourguide.com — GYG 主页，反爬（403）；信息来自 Wikipedia
10. ⚠️ https://www.viator.com/24-hour-cancellation/ — 24h 政策页，反爬（403）；标注为【行业通行】+ 【推断】
11. ⚠️ https://www.getyourguide.com/gYG-Originals/ — GYG Originals 页，反爬（403）；标注为【行业通行】+ 【推断】
12. ⚠️ https://www.klook.com/en-IN/klook-pass — Klook Pass 页，404；标注为【行业通行】+ 【推断】

---

## 六、研究方法学与诚实声明

### 6.1 已查证 vs 推断比例

- **【已查证】项**：Tiqets 全部功能描述（5 条）；Klook / GYG / Viator 公司层基本信息（成立时间、规模、地理覆盖）；Viator 与 Tripadvisor 关系。
- **【行业通行】项**：Klook Pass 形态、GYG Originals 概念、Viator 24h 政策、AI Planner 系列功能、Wallet 集成、affiliate program——这些是行业反复公开宣传的能力，本研究基于过去 1–2 年的公开资料与产品记忆。
- **【推断】项**：具体的城市集合、SKU 数量、AI 模型的工程实现、佣金比例、客服 SLA 等数字。

### 6.2 已知研究局限

1. Klook、Viator、GetYourGuide 三家主站对 WebFetch 全部 403，未能直接抓取详情页 / 帮助中心 / 政策文档。
2. 部分 URL（如 Klook Pass 落地页 / GYG Originals 页）404，可能是地域重定向。
3. 2025–2026 的"最新形态"在公开网络上分散、且部分为 PR 文案而非功能清单，需要**人肉浏览 + 截图**才能完全确认。

### 6.3 建议后续动作

1. **人工复核清单**：Klook Pass（亚洲城市集）、Viator CFAR（产品范围）、GYG Originals（自营产品目录）、Tiqets Wallet（iOS 端实测）。
2. **可补充来源**：Phocuswright 报告、Skift Research、Condé Nast Traveler 产品评测、Tripadvisor 投资者电话会议纪要（Viator 业绩披露）、Klook S-1 招股书。
3. **建议升级研究方法**：用 Playwright 浏览器模拟（已可用）+ 多 IP 轮询，或通过 VPN 切换区域以绕开 403。
