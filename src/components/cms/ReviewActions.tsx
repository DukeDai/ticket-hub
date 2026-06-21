'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';

interface ReviewActionsProps {
  productId: string;
  status: string;
  userRole: 'user' | 'staff' | 'admin';
  createdById?: string;
  currentUserId: string;
}

export function ReviewActions({
  productId,
  status,
  userRole,
  createdById,
  currentUserId,
}: ReviewActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const isOwner = createdById === currentUserId;
  const canSubmit = (isOwner || userRole === 'staff' || userRole === 'admin') && status === 'draft';
  const canReview = (userRole === 'staff' || userRole === 'admin') && status === 'pending_review';

  async function handleAction(action: 'submit' | 'approve' | 'reject') {
    if (action === 'reject' && !rejectNote.trim()) return;
    setLoading(action);
    try {
      const body: { action: string; reason?: string } = { action };
      if (action === 'reject') body.reason = rejectNote;

      const res = await fetch(`/api/products/${productId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Failed' }));
        alert(err.message ?? 'Action failed');
        return;
      }
      setShowRejectInput(false);
      setRejectNote('');
      router.refresh();
    } finally {
      setLoading(null);
    }
  }

  if (!canSubmit && !canReview) return null;

  return (
    <div className="flex flex-col gap-1">
      {canSubmit && (
        <Button
          variant="secondary"
          size="sm"
          loading={loading === 'submit'}
          onClick={() => handleAction('submit')}
        >
          提交审核
        </Button>
      )}
      {canReview && (
        <>
          <Button
            variant="primary"
            size="sm"
            loading={loading === 'approve'}
            onClick={() => handleAction('approve')}
          >
            批准
          </Button>
          {!showRejectInput ? (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowRejectInput(true)}
            >
              拒绝
            </Button>
          ) : (
            <div className="flex flex-col gap-1">
              <input
                type="text"
                placeholder="拒绝原因"
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              />
              <div className="flex gap-1">
                <Button
                  variant="danger"
                  size="sm"
                  loading={loading === 'reject'}
                  disabled={!rejectNote.trim()}
                  onClick={() => handleAction('reject')}
                >
                  确认拒绝
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => { setShowRejectInput(false); setRejectNote(''); }}
                >
                  取消
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}