'use client';

import { useEffect } from 'react';

/** Adds a single, shared scroll observer for the landing page reveal moments. */
export default function LandingEffects() {
  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>('[data-reveal]');
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.14, rootMargin: '0px 0px -40px' },
    );

    elements.forEach(element => observer.observe(element));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const nav = document.querySelector<HTMLElement>('[data-landing-nav]');
    const hero = document.querySelector<HTMLElement>('[data-landing-hero]');
    if (!nav || !hero) return;

    const updateNav = () => {
      nav.classList.toggle('is-compact', window.scrollY >= hero.offsetHeight - 84);
    };

    updateNav();
    window.addEventListener('scroll', updateNav, { passive: true });
    return () => window.removeEventListener('scroll', updateNav);
  }, []);

  return null;
}
