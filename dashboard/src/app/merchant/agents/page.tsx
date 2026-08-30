import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import AgentsClient from './AgentsClient';
import styles from '@/app/dashboard.module.css';

export default async function AgentsPage() {
  const session = await auth();
  if (!session?.user?.merchantId) redirect('/login');

  const clients = await prisma.agentClient.findMany({ 
    orderBy: { createdAt: 'desc' } 
  });

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Agent Clients</h1>
          <p className={styles.pageSubtitle}>OAuth2 credentials for autonomous AI agents</p>
        </div>
      </div>
      <AgentsClient clients={clients} />
    </div>
  );
}
