import { prisma } from '@/lib/prisma';
import { Save } from 'lucide-react';
import { revalidatePath } from 'next/cache';

export default async function SettingsPage() {
  const merchant = await prisma.merchant.findFirst();

  if (!merchant) {
    return <div>No merchant found. Please onboard a merchant first.</div>;
  }

  async function saveSettings(formData: FormData) {
    'use server';
    const fulfillmentUrl = formData.get('fulfillmentWebhookUrl') as string;
    
    await prisma.merchant.update({
      where: { id: merchant?.id },
      data: { fulfillmentWebhookUrl: fulfillmentUrl }
    });

    revalidatePath('/settings');
  }

  return (
    <div>
      <div className="card-title" style={{ borderBottom: 'none', marginBottom: '1.5rem', fontSize: '1.5rem' }}>
        <h2>Merchant Settings</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', fontWeight: 400, marginTop: '0.25rem' }}>
          Global configuration for {merchant.name}
        </p>
      </div>

      <div className="card" style={{ maxWidth: '600px' }}>
        <form action={saveSettings}>
          <div className="form-group">
            <label className="form-label">Merchant Name</label>
            <input type="text" className="form-input mono" disabled value={merchant.name} />
          </div>

          <div className="form-group">
            <label className="form-label">API Key Prefix</label>
            <input type="text" className="form-input mono" disabled value={merchant.apiKeyPrefix} />
          </div>

          <div className="form-group">
            <label className="form-label">Fulfillment Webhook URL</label>
            <input 
              type="url" 
              name="fulfillmentWebhookUrl"
              className="form-input mono" 
              defaultValue={merchant.fulfillmentWebhookUrl || ''} 
              placeholder="https://your-server.com/webhooks/acg"
            />
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
              Where we will send `order.created` payloads for you to fulfill.
            </p>
          </div>

          <div className="form-group">
            <label className="form-label">Webhook Signing Secret</label>
            <input type="text" className="form-input mono" disabled value={merchant.webhookSigningSecret ? '************************' : 'Not Generated'} />
          </div>

          <div style={{ marginTop: '2rem' }}>
            <button type="submit" className="btn btn-primary">
              <Save size={16} /> Save Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
