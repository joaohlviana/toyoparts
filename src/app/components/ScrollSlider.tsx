import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════════ */
/* ScrollSlider — Apple-style native scroll-snap slider                      */
/* Uses CSS scroll-snap + smooth scrolling for buttery-smooth experience     */
/* ═══════════════════════════════════════════════════════════════════════════ */

interface ScrollSliderProps {
  children: React.ReactNode;
  className?: string;
  /** CSS class applied to each item wrapper for width control */
  itemClassName?: string;
  /** Show navigation arrows on desktop (default: true) */
  arrows?: boolean;
  /** Background color token for edge fade gradients (default: 'background') */
  fadeBg?: string;
}

export function ScrollSlider({
  children,
  className = '',
  itemClassName = 'w-[48%] sm:w-[32%] md:w-[24%] xl:w-[19.5%]',
  arrows = true,
  fadeBg,
}: ScrollSliderProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 2);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Slight delay to let children render/measure
    const t = setTimeout(checkScroll, 50);
    el.addEventListener('scroll', checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => {
      clearTimeout(t);
      el.removeEventListener('scroll', checkScroll);
      ro.disconnect();
    };
  }, [checkScroll, children]);

  const scroll = useCallback((dir: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    // Scroll ~80% of visible width for a page-like feel
    const delta = el.clientWidth * 0.82;
    el.scrollBy({
      left: dir === 'left' ? -delta : delta,
      behavior: 'smooth',
    });
  }, []);

  const items = React.Children.toArray(children);

  return (
    <div className={`group/slider relative ${className}`}>
      {/* Scroll track */}
      <div
        ref={scrollRef}
        className="flex gap-3 sm:gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory no-scrollbar pb-1"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {items.map((child, i) => (
          <div
            key={(child as any)?.key ?? i}
            className={`flex-shrink-0 snap-start ${itemClassName}`}
          >
            {child}
          </div>
        ))}
      </div>

      {/* Left arrow */}
      {arrows && (
        <button
          onClick={() => scroll('left')}
          aria-label="Anterior"
          className={`
            absolute left-1 top-1/2 -translate-y-1/2 z-10
            w-9 h-9 sm:w-10 sm:h-10 rounded-full
            bg-white/95 dark:bg-neutral-800/95 shadow-lg border border-black/[0.06] dark:border-white/10
            flex items-center justify-center
            text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white
            hover:shadow-xl hover:scale-105
            backdrop-blur-sm
            transition-all duration-300 ease-out
            ${canScrollLeft
              ? 'opacity-0 group-hover/slider:opacity-100 pointer-events-auto'
              : 'opacity-0 !pointer-events-none'
            }
          `}
        >
          <ChevronLeft className="w-5 h-5" strokeWidth={2.2} />
        </button>
      )}

      {/* Right arrow */}
      {arrows && (
        <button
          onClick={() => scroll('right')}
          aria-label="Proximo"
          className={`
            absolute right-1 top-1/2 -translate-y-1/2 z-10
            w-9 h-9 sm:w-10 sm:h-10 rounded-full
            bg-white/95 dark:bg-neutral-800/95 shadow-lg border border-black/[0.06] dark:border-white/10
            flex items-center justify-center
            text-neutral-600 hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-white
            hover:shadow-xl hover:scale-105
            backdrop-blur-sm
            transition-all duration-300 ease-out
            ${canScrollRight
              ? 'opacity-0 group-hover/slider:opacity-100 pointer-events-auto'
              : 'opacity-0 !pointer-events-none'
            }
          `}
        >
          <ChevronRight className="w-5 h-5" strokeWidth={2.2} />
        </button>
      )}

      {/* Edge fade indicators */}
      <div
        className={`hidden sm:block absolute left-0 top-0 bottom-1 w-10 pointer-events-none z-[5] transition-opacity duration-300 ${
          canScrollLeft ? 'opacity-100' : 'opacity-0'
        } bg-gradient-to-r ${fadeBg ?? 'from-background'} to-transparent`}
      />
      <div
        className={`hidden sm:block absolute right-0 top-0 bottom-1 w-10 pointer-events-none z-[5] transition-opacity duration-300 ${
          canScrollRight ? 'opacity-100' : 'opacity-0'
        } bg-gradient-to-l ${fadeBg ?? 'from-background'} to-transparent`}
      />
    </div>
  );
}