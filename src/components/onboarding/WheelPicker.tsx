"use client";

import { useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface WheelPickerProps {
  items: string[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  infinite?: boolean;
}

export function WheelPicker({ items, value, onChange, className, infinite = false }: WheelPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScrolling, setIsScrolling] = useState(false);
  const itemHeight = 44;
  const visibleItems = 5;
  const repeatCount = infinite ? 100 : 1;
  const totalItems = items.length * repeatCount;
  const middleOffset = Math.floor(repeatCount / 2) * items.length;

  const selectedIndex = items.indexOf(value);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (containerRef.current && !isScrolling) {
      const targetIndex = middleOffset + selectedIndex;
      const scrollTop = targetIndex * itemHeight;
      containerRef.current.scrollTop = scrollTop;
    }
  }, [selectedIndex, isScrolling, middleOffset]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    
    setIsScrolling(true);
    
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      handleScrollEnd();
    }, 150);
  };

  const handleScrollEnd = () => {
    if (!containerRef.current) return;
    
    const scrollTop = containerRef.current.scrollTop;
    const rawIndex = Math.round(scrollTop / itemHeight);
    const itemIndex = rawIndex % items.length;
    const actualItem = items[itemIndex];
    
    if (actualItem !== value) {
      onChange(actualItem);
    }
    
    if (infinite) {
      const targetIndex = middleOffset + itemIndex;
      if (Math.abs(rawIndex - targetIndex) > items.length) {
        containerRef.current.scrollTop = targetIndex * itemHeight;
      }
    }
    
    containerRef.current.scrollTo({
      top: Math.round(scrollTop / itemHeight) * itemHeight,
      behavior: "smooth",
    });
    
    setTimeout(() => setIsScrolling(false), 100);
  };

  const allItems = infinite
    ? Array.from({ length: totalItems }, (_, i) => items[i % items.length])
    : items;

  return (
    <div className={cn("relative", className)} style={{ height: itemHeight * visibleItems }}>
      <div
        className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-11 border-y border-border pointer-events-none z-10"
      />
      
      <div
        ref={containerRef}
        className="h-full overflow-y-auto scrollbar-hide snap-y snap-mandatory"
        onScroll={handleScroll}
        onTouchEnd={handleScrollEnd}
        onMouseUp={handleScrollEnd}
        style={{
          paddingTop: itemHeight * 2,
          paddingBottom: itemHeight * 2,
        }}
      >
        {allItems.map((item, index) => {
          const actualIndex = infinite ? index - middleOffset : index;
          const distance = Math.abs(actualIndex - selectedIndex);
          const isSelected = item === value && distance < items.length / 2;
          
          return (
            <div
              key={`${item}-${index}`}
              className={cn(
                "h-11 flex items-center justify-center snap-center transition-all duration-150 cursor-pointer",
                isSelected
                  ? "text-foreground text-lg font-semibold"
                  : distance === 1
                  ? "text-muted-foreground text-base"
                  : "text-muted-foreground/50 text-sm"
              )}
              onClick={() => {
                onChange(item);
                if (containerRef.current) {
                  const targetScroll = index * itemHeight;
                  containerRef.current.scrollTo({
                    top: targetScroll,
                    behavior: "smooth",
                  });
                }
              }}
            >
              {item}
            </div>
          );
        })}
      </div>
    </div>
  );
}
