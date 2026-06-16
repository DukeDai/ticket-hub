import { VoucherVerifier } from './VoucherVerifier';

export default function CmsVouchersPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">票券核销</h1>
      <VoucherVerifier />
    </div>
  );
}
