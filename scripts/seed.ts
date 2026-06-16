/**
 * 初始化种子数据：管理员账号 + 几个分类 + 几个商品。
 *
 * 运行：
 *   npm run seed
 *
 * 依赖：tsx（已声明），Node 20+ 原生支持 .env 加载
 * 环境变量从 process.env 读取（启动前手动 source .env 或用 dotenv-cli）。
 */
import mongoose from 'mongoose';
import { connectDB } from '../src/lib/db';
import { User, Category, Product } from '../src/models';
import { hashPassword } from '../src/lib/auth/password';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@tickets.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'Admin@12345';
const ADMIN_NAME = 'Site Admin';

async function main() {
  await connectDB();
  console.log('[seed] connected');

  // 1. 管理员账号
  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const admin = await User.findOneAndUpdate(
    { email: ADMIN_EMAIL },
    {
      $setOnInsert: {
        email: ADMIN_EMAIL,
        name: ADMIN_NAME,
        role: 'admin',
        isActive: true,
      },
      $set: { passwordHash },
    },
    { upsert: true, new: true }
  );
  console.log(`[seed] admin: ${admin.email} (id=${admin._id})`);

  // 2. 分类
  const categoriesData = [
    { name: '景区门票', slug: 'scenic', ticketType: 'sight' as const, sortOrder: 1, icon: '🏞' },
    { name: '演出票', slug: 'show', ticketType: 'show' as const, sortOrder: 2, icon: '🎭' },
    { name: '餐饮券', slug: 'dining', ticketType: 'dining' as const, sortOrder: 3, icon: '🍽' },
    { name: '体验项目', slug: 'experience', ticketType: 'experience' as const, sortOrder: 4, icon: '🛶' },
  ];

  const catMap = new Map<string, mongoose.Types.ObjectId>();
  for (const c of categoriesData) {
    const doc = await Category.findOneAndUpdate(
      { slug: c.slug },
      { $set: c },
      { upsert: true, new: true }
    );
    catMap.set(c.slug, doc._id);
  }
  console.log(`[seed] categories: ${catMap.size}`);

  // 3. 商品
  const productsData = [
    {
      title: '故宫博物院成人票（电子票）',
      slug: 'forbidden-city-adult',
      summary: '探索明清两代皇家宫殿，感受中华文明的厚重。',
      description:
        '开放时间：8:30-17:00（每周一闭馆）。\n入园方式：刷身份证直接入园。\n退改：使用前 2 小时可退。',
      images: ['https://placehold.co/600x400?text=Forbidden+City'],
      categorySlug: 'scenic',
      ticketType: 'sight' as const,
      priceInCents: 5800,
      originalPriceInCents: 6000,
      stock: 1000,
      location: { city: '北京', address: '东城区景山前街 4 号' },
      refundable: true,
      validDaysAfterPurchase: 30,
      attributes: { entryMethod: '身份证', lastEntryTime: '16:00' },
    },
    {
      title: '国家大剧院《天鹅湖》VIP 票',
      slug: 'swan-lake-vip',
      summary: '世界级芭蕾舞团倾情演绎。',
      description:
        '2026 年 7 月 15 日 19:30 国家大剧院歌剧厅。\n座位：A 区前三排。\n入场：演出前 30 分钟。',
      images: ['https://placehold.co/600x400?text=Swan+Lake'],
      categorySlug: 'show',
      ticketType: 'show' as const,
      priceInCents: 128000,
      originalPriceInCents: 158000,
      stock: 200,
      location: { city: '北京', address: '西城区西长安街 2 号' },
      refundable: true,
      refundDeadlineHours: 48,
      skuVariants: [
        { name: '2026-07-15 A 区', priceInCents: 128000, stock: 30, sold: 0 },
        { name: '2026-07-15 B 区', priceInCents: 88000, stock: 50, sold: 0 },
      ],
    },
    {
      title: '海底捞 100 元代金券',
      slug: 'haidilao-voucher-100',
      summary: '全国门店通用，可叠加。',
      description:
        '本券为电子券，结账时出示二维码核销。\n有效期：购买后 90 天内。\n使用规则：单笔消费满 200 元可使用 1 张。',
      images: ['https://placehold.co/600x400?text=Hotpot'],
      categorySlug: 'dining',
      ticketType: 'dining' as const,
      priceInCents: 8800,
      originalPriceInCents: 10000,
      stock: 5000,
      location: { city: '全国', address: '全国门店通用' },
      refundable: true,
      validDaysAfterPurchase: 90,
      attributes: { stores: ['北京三里屯店', '上海人民广场店', '广州天河店'] },
    },
    {
      title: '千岛湖皮划艇半日体验',
      slug: 'qiandao-kayak',
      summary: '专业教练带队，安全好玩。',
      description:
        '时长 3 小时，含装备。\n集合地点：千岛湖旅游码头 8 号位。\n建议提前 15 分钟到场。',
      images: ['https://placehold.co/600x400?text=Kayak'],
      categorySlug: 'experience',
      ticketType: 'experience' as const,
      priceInCents: 28000,
      originalPriceInCents: 32000,
      stock: 100,
      location: { city: '杭州', address: '淳安县千岛湖镇' },
      refundable: true,
      validDaysAfterPurchase: 60,
      attributes: { meetingPoint: '千岛湖旅游码头 8 号位', durationMinutes: 180 },
      dailyInventory: [
        { date: '2026-06-20', stock: 20, sold: 0 },
        { date: '2026-06-21', stock: 20, sold: 0 },
        { date: '2026-06-22', stock: 20, sold: 0 },
      ],
    },
  ];

  for (const p of productsData) {
    const categoryId = catMap.get(p.categorySlug);
    if (!categoryId) continue;
    await Product.findOneAndUpdate(
      { slug: p.slug },
      {
        $set: {
          ...p,
          categoryId,
          status: 'active',
          createdBy: admin._id,
        },
      },
      { upsert: true }
    );
  }
  console.log(`[seed] products: ${productsData.length}`);

  await mongoose.disconnect();
  console.log('[seed] done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
