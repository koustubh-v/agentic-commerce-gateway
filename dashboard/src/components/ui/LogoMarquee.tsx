'use client';

import React from 'react';

const companies = [
  { name: 'Anthropic', src: 'https://logo.clearbit.com/anthropic.com', wide: false },
  { name: 'OpenAI', src: 'https://upload.wikimedia.org/wikipedia/commons/4/4d/OpenAI_Logo.svg', wide: true },
  { name: 'Google DeepMind', src: 'https://logo.clearbit.com/deepmind.com', wide: false },
  { name: 'Mistral AI', src: 'https://logo.clearbit.com/mistral.ai', wide: false },
  { name: 'Cohere', src: 'https://logo.clearbit.com/cohere.com', wide: false },
  { name: 'Perplexity', src: 'https://logo.clearbit.com/perplexity.ai', wide: false },
  { name: 'Hugging Face', src: 'https://logo.clearbit.com/huggingface.co', wide: false },
  { name: 'LangChain', src: 'https://logo.clearbit.com/langchain.com', wide: false },
  { name: 'Microsoft', src: 'https://logo.clearbit.com/microsoft.com', wide: false },
  { name: 'AWS', src: 'https://logo.clearbit.com/aws.amazon.com', wide: false },
];

interface LogoItemProps {
  name: string;
  src: string;
  wide: boolean;
  keyPrefix: string;
  idx: number;
}

function LogoItem({ name, src, wide, keyPrefix, idx }: LogoItemProps) {
  return (
    <div
      key={`${keyPrefix}-${idx}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        flexShrink: 0,
        filter: 'grayscale(1)',
        opacity: 0.5,
        transition: 'filter 0.3s ease, opacity 0.3s ease',
        cursor: 'default',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.filter = 'grayscale(0)';
        (e.currentTarget as HTMLDivElement).style.opacity = '1';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.filter = 'grayscale(1)';
        (e.currentTarget as HTMLDivElement).style.opacity = '0.5';
      }}
    >
      <img
        src={src}
        alt={name}
        style={{
          height: wide ? '18px' : '24px',
          width: 'auto',
          maxWidth: wide ? '100px' : '24px',
          objectFit: 'contain',
          display: 'block',
        }}
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
      <span style={{
        fontSize: '0.95rem',
        fontWeight: 600,
        color: '#171717',
        letterSpacing: '-0.01em',
        whiteSpace: 'nowrap',
      }}>
        {name}
      </span>
    </div>
  );
}

const LogoMarquee: React.FC = () => {
  return (
    <div
      style={{
        width: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'row',
        maskImage: 'linear-gradient(to right, rgba(0,0,0,0) 0%, rgb(0,0,0) 10%, rgb(0,0,0) 90%, rgba(0,0,0,0) 100%)',
        WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,0) 0%, rgb(0,0,0) 10%, rgb(0,0,0) 90%, rgba(0,0,0,0) 100%)',
        paddingTop: '1.25rem',
        paddingBottom: '1.25rem',
        borderBottom: '1px solid #f0f0f0',
      }}
    >
      {[0, 1].map((set) => (
        <div
          key={set}
          aria-hidden={set === 1}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '3rem',
            flexShrink: 0,
            paddingLeft: '3rem',
            animation: 'marquee 35s linear infinite',
          }}
        >
          {companies.map((company, idx) => (
            <LogoItem
              key={`${set}-${idx}`}
              name={company.name}
              src={company.src}
              wide={company.wide}
              keyPrefix={`set${set}`}
              idx={idx}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

export default LogoMarquee;
