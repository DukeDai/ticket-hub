import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'TicketHub - 票券商城',
    template: '%s | TicketHub',
  },
  description: '景区门票 / 演出票 / 餐饮券 / 体验券一站式购买',
  metadataBase: new URL('http://localhost:3000'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
