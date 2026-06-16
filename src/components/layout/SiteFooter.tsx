export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-gray-500">
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          <div>
            <div className="font-semibold text-gray-700">关于</div>
            <ul className="mt-2 space-y-1">
              <li>公司介绍</li>
              <li>联系我们</li>
            </ul>
          </div>
          <div>
            <div className="font-semibold text-gray-700">商家</div>
            <ul className="mt-2 space-y-1">
              <li>商家入驻</li>
              <li>票券管理</li>
            </ul>
          </div>
          <div>
            <div className="font-semibold text-gray-700">服务</div>
            <ul className="mt-2 space-y-1">
              <li>退改政策</li>
              <li>使用说明</li>
            </ul>
          </div>
          <div>
            <div className="font-semibold text-gray-700">客服</div>
            <ul className="mt-2 space-y-1">
              <li>在线客服</li>
              <li>400-000-0000</li>
            </ul>
          </div>
        </div>
        <div className="mt-6 border-t border-gray-200 pt-4 text-xs text-gray-400">
          © {new Date().getFullYear()} TicketHub. Demo for educational purposes.
        </div>
      </div>
    </footer>
  );
}
