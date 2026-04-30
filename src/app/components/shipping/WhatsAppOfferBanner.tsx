import React from 'react';
import whatsappFreteBannerSrc from '../../../assets/whatsapp-frete-banner-user.webp';

interface WhatsAppOfferBannerProps {
  href: string;
  message?: string | null;
  onClick?: () => void;
  className?: string;
}

function WhatsAppIconSvg({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M27.9 15.17C27.9 8.9 22.87 3.82 16.67 3.82C10.47 3.82 5.44 8.9 5.44 15.17C5.44 17.18 5.96 19.13 6.94 20.85L5.32 26.73L11.29 25.17C12.95 26.07 14.82 26.52 16.67 26.52C22.87 26.52 27.9 21.44 27.9 15.17Z"
        fill="currentColor"
      />
      <path
        d="M23.24 17.97C22.95 17.82 21.49 17.11 21.22 17.02C20.95 16.93 20.75 16.88 20.56 17.17C20.37 17.46 19.82 18.12 19.67 18.29C19.52 18.46 19.37 18.48 19.08 18.33C18.79 18.18 17.86 17.88 16.76 16.9C15.9 16.14 15.33 15.19 15.16 14.9C15 14.61 15.14 14.45 15.29 14.31C15.42 14.18 15.58 13.98 15.72 13.82C15.86 13.66 15.91 13.53 16 13.34C16.1 13.15 16.05 12.98 15.98 12.84C15.91 12.69 15.34 11.23 15.1 10.67C14.87 10.12 14.63 10.19 14.45 10.18H13.95C13.77 10.18 13.47 10.25 13.21 10.54C12.95 10.83 12.22 11.52 12.22 12.91C12.22 14.3 13.24 15.64 13.38 15.83C13.52 16.02 15.39 18.93 18.25 20.16C20.64 21.18 21.13 20.98 21.65 20.93C22.17 20.88 23.34 20.21 23.56 19.58C23.78 18.95 23.78 18.41 23.71 18.29C23.63 18.17 23.53 18.12 23.24 17.97Z"
        fill="#25D366"
      />
      <path
        d="M16.67 6.17C11.78 6.17 7.82 10.17 7.82 15.11C7.82 16.84 8.32 18.53 9.25 19.97L8.31 23.37L11.75 22.47C13.15 23.36 14.76 23.83 16.67 23.83C21.56 23.83 25.52 19.82 25.52 14.88C25.52 9.95 21.56 6.17 16.67 6.17Z"
        fill="white"
      />
      <path
        d="M22.32 18.18C22.08 18.06 20.93 17.5 20.72 17.43C20.5 17.36 20.35 17.32 20.2 17.54C20.05 17.77 19.61 18.29 19.49 18.43C19.38 18.57 19.26 18.59 19.03 18.47C18.8 18.35 18.06 18.11 17.18 17.34C16.49 16.73 16.03 15.98 15.9 15.75C15.77 15.52 15.89 15.39 16 15.28C16.11 15.17 16.24 15 16.35 14.88C16.46 14.75 16.5 14.65 16.58 14.5C16.66 14.35 16.62 14.21 16.56 14.1C16.5 13.98 16.05 12.82 15.86 12.37C15.68 11.93 15.48 11.97 15.34 11.96L14.95 11.95C14.81 11.95 14.57 12.01 14.38 12.24C14.18 12.46 13.6 13.01 13.6 14.11C13.6 15.21 14.42 16.28 14.53 16.43C14.64 16.58 16.14 18.91 18.44 19.9C20.36 20.72 20.75 20.56 21.18 20.52C21.6 20.48 22.54 19.95 22.72 19.44C22.9 18.94 22.9 18.5 22.84 18.41C22.79 18.31 22.66 18.29 22.32 18.18Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function WhatsAppOfferBanner({
  href,
  message,
  onClick,
  className = '',
}: WhatsAppOfferBannerProps) {
  const ariaLabel = message
    ? `Frete gratis pelo WhatsApp. ${message}`
    : 'Frete gratis pelo WhatsApp';

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      aria-label={ariaLabel}
      title={message || 'Frete gratis pelo WhatsApp'}
      className={`group relative block overflow-hidden rounded-2xl border border-[#25D366]/25 bg-white shadow-[0_10px_30px_rgba(18,140,126,0.12)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(18,140,126,0.18)] ${className}`.trim()}
    >
      <img
        src={whatsappFreteBannerSrc}
        alt="Frete gratis pelo WhatsApp"
        className="block h-auto w-full transition-transform duration-300 group-hover:scale-[1.015]"
        loading="lazy"
      />
      <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-[18%] items-center justify-center md:flex">
        <div className="flex aspect-square w-[68%] items-center justify-center rounded-full border-[5px] border-white bg-[#19c219] shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
          <WhatsAppIconSvg className="h-[72%] w-[72%] text-white" />
        </div>
      </div>
      {message ? <span className="sr-only">{message}</span> : null}
    </a>
  );
}
