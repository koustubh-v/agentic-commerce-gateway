import React from 'react';
import { Info } from 'lucide-react';
import styles from '@/app/dashboard.module.css';

interface TooltipProps {
  content: string;
}

export default function Tooltip({ content }: TooltipProps) {
  return (
    <div className={styles.tooltipContainer}>
      <Info size={14} className={styles.tooltipIcon} />
      <div className={styles.tooltipContent}>
        {content}
      </div>
    </div>
  );
}
