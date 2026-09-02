import styles from '@/app/dashboard.module.css';
import { BookOpen, CheckCircle, Terminal, LayoutDashboard } from 'lucide-react';

export default function IntegrationDocsPage() {
  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Integration Guide</h1>
          <p className={styles.pageSubtitle}>Learn how to sync your product catalog to ACG using Mode A (Polling).</p>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        
        {/* Intro Card */}
        <div className={styles.activityCard}>
          <div className={styles.activityCardHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BookOpen size={16} color="var(--text-secondary)" />
              How Mode A Works
            </div>
          </div>
          <div style={{ padding: '1.5rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <p style={{ marginBottom: '1rem' }}>
              In Mode A, you don't need to write complex webhooks or push data to us. Instead, ACG's poller visits a specific endpoint on your website (e.g., <code style={{ background: '#f5f5f5', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.85rem' }}>/api/export-catalog</code>) at regular intervals to pull down your products. 
            </p>
            <p>
              Your only job is to create an API route that reads your database and returns the products in the exact JSON format that ACG expects. ACG takes care of the rest!
            </p>
          </div>
        </div>

        {/* Schema Card */}
        <div className={styles.activityCard}>
          <div className={styles.activityCardHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <CheckCircle size={16} color="var(--text-secondary)" />
              Step 1: The ACG Standard Format
            </div>
          </div>
          <div style={{ padding: '1.5rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <p style={{ marginBottom: '1rem' }}>
              Your endpoint must support pagination via <code style={{ background: '#f5f5f5', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.85rem' }}>?page=X&limit=Y</code> and return a JSON object with this exact shape:
            </p>
            
            <pre style={{ 
              background: '#0a0a0a', color: '#e5e5e5', padding: '1rem', 
              borderRadius: '8px', overflowX: 'auto', fontSize: '0.85rem',
              lineHeight: 1.5, border: '1px solid #262626'
            }}>
{`{
  "data": [
    {
      "external_id": "your_db_id_123",
      "name": "Sony WH-1000XM5",
      "description": "Noise cancelling headphones",
      "price_in_cents": 2499900,  // Always multiply dollars/rupees by 100!
      "currency": "INR",
      "in_stock": true,           // Convert stock quantity to a boolean
      "categories": ["Electronics", "Audio"],
      "variants": []              // Leave empty if no variants
    }
  ],
  "page": 1,
  "has_more": true
}`}
            </pre>
          </div>
        </div>

        {/* Code Examples Card */}
        <div className={styles.activityCard}>
          <div className={styles.activityCardHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Terminal size={16} color="var(--text-secondary)" />
              Step 2: Copy & Paste Examples
            </div>
          </div>
          <div style={{ padding: '1.5rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <p style={{ marginBottom: '1.5rem' }}>Here are implementation examples for common web frameworks. Choose the one that matches your stack.</p>
            
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Node.js / Express (with Prisma)</h3>
            <pre style={{ 
              background: '#0a0a0a', color: '#e5e5e5', padding: '1rem', 
              borderRadius: '8px', overflowX: 'auto', fontSize: '0.85rem',
              lineHeight: 1.5, border: '1px solid #262626', marginBottom: '2rem'
            }}>
{`app.get("/api/export-catalog", async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 100;
  const skip = (page - 1) * limit;

  const products = await prisma.product.findMany({ skip, take: limit });

  const formattedProducts = products.map((prod) => ({
    external_id: prod.id,
    name: prod.name,
    description: prod.description,
    price_in_cents: Math.round(Number(prod.price) * 100),
    currency: "USD",
    in_stock: prod.stockQuantity > 0,
    categories: [],
    variants: []
  }));

  res.json({
    data: formattedProducts,
    page: page,
    has_more: formattedProducts.length === limit,
  });
});`}
            </pre>

            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Next.js (App Router)</h3>
            <pre style={{ 
              background: '#0a0a0a', color: '#e5e5e5', padding: '1rem', 
              borderRadius: '8px', overflowX: 'auto', fontSize: '0.85rem',
              lineHeight: 1.5, border: '1px solid #262626', marginBottom: '2rem'
            }}>
{`import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '100');
  
  // Fetch from DB...
  // Map to ACG format...
  
  return NextResponse.json({
    data: formattedProducts,
    page: page,
    has_more: formattedProducts.length === limit
  });
}`}
            </pre>

            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>Python / Django</h3>
            <pre style={{ 
              background: '#0a0a0a', color: '#e5e5e5', padding: '1rem', 
              borderRadius: '8px', overflowX: 'auto', fontSize: '0.85rem',
              lineHeight: 1.5, border: '1px solid #262626'
            }}>
{`from django.http import JsonResponse
from .models import Product

def export_catalog(request):
    page = int(request.GET.get('page', 1))
    limit = int(request.GET.get('limit', 100))
    offset = (page - 1) * limit

    products = Product.objects.filter(is_active=True)[offset:offset+limit]
    
    data = [{
        "external_id": str(p.id),
        "name": p.title,
        "description": p.description,
        "price_in_cents": int(p.price * 100),
        "currency": "USD",
        "in_stock": p.stock > 0,
        "categories": [c.name for c in p.categories.all()],
        "variants": []
    } for p in products]

    return JsonResponse({
        "data": data,
        "page": page,
        "has_more": len(data) == limit
    })`}
            </pre>
          </div>
        </div>

        {/* Next Steps Card */}
        <div className={styles.activityCard}>
          <div className={styles.activityCardHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <LayoutDashboard size={16} color="var(--text-secondary)" />
              Step 3: Connect to ACG
            </div>
          </div>
          <div style={{ padding: '1.5rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            <p>
              Once your endpoint is live, go to the <strong>Connect Store</strong> tab in this dashboard. Enter your endpoint URL (e.g., <code style={{ background: '#f5f5f5', padding: '0.2rem 0.4rem', borderRadius: '4px', fontSize: '0.85rem' }}>https://yourstore.com/api/export-catalog</code>) and select "Mode A (Polling)". 
            </p>
            <p style={{ marginTop: '1rem' }}>
              ACG will immediately begin ingesting your products. You can watch the sync progress in the <strong>Catalog</strong> tab!
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
