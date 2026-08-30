// This file is superseded by /merchant/audit/page.tsx
// Redirect to merchant audit
import { redirect } from 'next/navigation';

export default function OldAuditPage() {
  redirect('/merchant/audit');
}
