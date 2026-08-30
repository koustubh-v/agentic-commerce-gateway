'use client';

import React, { useEffect, useRef, useMemo, type ReactNode, type RefObject } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface ScrollRevealProps {
  children: ReactNode;
  scrollContainerRef?: RefObject<HTMLElement | null>;
  baseOpacity?: number;
  baseRotation?: number;
  enableBlur?: boolean;
  blurStrength?: number;
  containerClassName?: string;
  textClassName?: string;
  rotationEnd?: string;
  wordAnimationEnd?: string;
}

const ScrollReveal: React.FC<ScrollRevealProps> = ({
  children,
  scrollContainerRef,
  baseOpacity = 0.1,
  baseRotation = 3,
  enableBlur = true,
  blurStrength = 4,
  containerClassName = '',
  textClassName = '',
  rotationEnd = 'bottom bottom',
  wordAnimationEnd = 'bottom center',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  const splitText = useMemo(() => {
    const text = typeof children === 'string' ? children : '';
    return text.split(/(\s+)/).map((word, index) => {
      if (word.match(/^\s+$/)) return word;
      return (
        <span
          className="word"
          key={index}
          style={{ display: 'inline-block', color: '#d0d0d0', willChange: 'color' }}
        >
          {word}
        </span>
      );
    });
  }, [children]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const scroller = scrollContainerRef?.current ?? window;
    const wordElements = el.querySelectorAll<HTMLElement>('.word');

    if (baseRotation !== 0) {
      gsap.fromTo(
        el,
        { transformOrigin: '0% 50%', rotate: baseRotation },
        {
          ease: 'none',
          rotate: 0,
          scrollTrigger: {
            trigger: el,
            scroller,
            start: 'top bottom',
            end: rotationEnd,
            scrub: true,
          },
        }
      );
    }

    const totalWords = wordElements.length;
    const triggers: ScrollTrigger[] = [];

    wordElements.forEach((word, i) => {
      const progress = i / totalWords;
      const startOffset = `${Math.round(progress * 60)}%`;

      const st = gsap.fromTo(
        word,
        { color: '#d0d0d0' },
        {
          color: '#171717',
          ease: 'none',
          scrollTrigger: {
            trigger: el,
            scroller,
            start: `top bottom-=${startOffset}`,
            end: `top center-=${startOffset}`,
            scrub: true,
          },
        }
      );

      if (enableBlur) {
        gsap.fromTo(
          word,
          { filter: `blur(${blurStrength}px)` },
          {
            filter: 'blur(0px)',
            ease: 'none',
            scrollTrigger: {
              trigger: el,
              scroller,
              start: `top bottom-=${startOffset}`,
              end: `top center-=${startOffset}`,
              scrub: true,
            },
          }
        );
      }
    });

    return () => {
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, [scrollContainerRef, baseRotation, rotationEnd, wordAnimationEnd, enableBlur, blurStrength, baseOpacity]);

  return (
    <div ref={containerRef} className={`my-5 ${containerClassName}`}>
      <p className={`leading-[1.5] font-medium ${textClassName}`}>{splitText}</p>
    </div>
  );
};

export default ScrollReveal;
