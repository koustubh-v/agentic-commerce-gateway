import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import styles from '@/app/dashboard.module.css';

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user?.merchantId) redirect('/login');

  const merchant = await prisma.merchant.findUnique({
    where: { id: session.user.merchantId! },
  });

  if (!merchant) redirect('/login');

  async function saveSettings(formData: FormData) {
    'use server';
    const fulfillmentWebhookUrl = formData.get('fulfillmentWebhookUrl') as string;
    const cancellationWebhookUrl = formData.get('cancellationWebhookUrl') as string;

    await prisma.merchant.update({
      where: { id: merchant!.id },
      data: {
        fulfillmentWebhookUrl: fulfillmentWebhookUrl || null,
        cancellationWebhookUrl: cancellationWebhookUrl || null,
      },
    });
    revalidatePath('/merchant/settings');
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Settings</h1>
          <p className={styles.pageSubtitle}>Webhook endpoints and merchant configuration</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
        {/* Merchant Info */}
        <div className={styles.formSection} style={{ padding: '2rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1.5rem' }}>
            Merchant Info
          </div>
          {[
            { label: 'Merchant ID', value: merchant.id, mono: true },
            { label: 'Name', value: merchant.name, mono: false },
            { label: 'Slug', value: merchant.slug, mono: true },
            { label: 'Status', value: merchant.status, mono: false },
            { label: 'API Key Prefix', value: merchant.apiKeyPrefix, mono: true },
            { label: 'Currency', value: merchant.currency, mono: true },
          ].map(({ label, value, mono }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid var(--border-color)' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{label}</span>
              <span style={{ fontSize: '0.85rem', fontFamily: mono ? 'monospace' : 'inherit', color: 'var(--text-primary)', textAlign: 'right', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Webhook Settings */}
        <div className={styles.formSection} style={{ padding: '2rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1.5rem' }}>
            Webhook Endpoints
          </div>
          <form action={saveSettings}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Fulfillment Webhook URL</label>
              <input type="url" name="fulfillmentWebhookUrl" className={`${styles.formInput} ${styles.mono}`}
                defaultValue={merchant.fulfillmentWebhookUrl ?? ''}
                placeholder="https://yourstore.com/webhooks/acg/orders" />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>ACG will POST signed order payloads here when payment succeeds.</p>
            </div>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Cancellation Webhook URL</label>
              <input type="url" name="cancellationWebhookUrl" className={`${styles.formInput} ${styles.mono}`}
                defaultValue={merchant.cancellationWebhookUrl ?? ''}
                placeholder="https://yourstore.com/webhooks/acg/cancel" />
            </div>
            <div style={{ marginBottom: '2rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Webhook Signing Secret</label>
              <input type="text" className={`${styles.formInput} ${styles.mono}`} disabled
                value={merchant.webhookSigningSecret ? '••••••••••••••••••••••••••••••••' : 'Not configured'} />
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>HMAC-SHA256 secret used to verify ACG webhook payloads. Contact admin to rotate.</p>
            </div>
            <button type="submit" className={styles.btnPrimary}>Save Settings</button>
          </form>
        </div>
      </div>
    </div>
  );
}
