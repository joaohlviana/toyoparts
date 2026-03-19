import React from 'react';
import toyotaPlaceholderImg from '../../assets/c8fad0d518808d9711b2db4c515def42227e635c.png';

/**
 * Toyota Genuine Parts placeholder image.
 * Used when a product has no photo or the photo URL is broken.
 */
export function ToyotaPlaceholder({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center select-none ${className}`}>
      <img
        src={toyotaPlaceholderImg}
        alt="Produto Original Toyota - Genuine Parts"
        className="max-w-full max-h-full object-contain"
        draggable={false}
      />
    </div>
  );
}
