import React from 'react';

const WHATSAPP_URL = 'https://api.whatsapp.com/send?phone=554332941144&text=Ol%C3%A1!%20Toyoparts!';

export function CompatibilityBanner() {
  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="group block w-full bg-[#D41216] hover:bg-[#bf1014] transition-colors duration-200 relative overflow-hidden"
    >
      {/* Puzzle pattern background */}
      <svg
        className="absolute inset-0 w-full h-full opacity-[0.08] pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <pattern id="puzzle" x="0" y="0" width="80" height="80" patternUnits="userSpaceOnUse">
            {/* Puzzle piece shape */}
            <path
              d="M0 0h30v12a8 8 0 0 1 0 16v12h-12a8 8 0 0 0-16 0H0V0z
                 M50 0h30v12a8 8 0 0 1 0 16v12h-12a8 8 0 0 0-16 0H40V28a8 8 0 0 0 0-16V0h10z
                 M0 40h30v12a8 8 0 0 1 0 16v12H18a8 8 0 0 0-16 0H0V40z
                 M50 40h30v12a8 8 0 0 1 0 16v12H68a8 8 0 0 0-16 0H40V68a8 8 0 0 0 0-16V40h10z"
              fill="white"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#puzzle)" />
      </svg>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 relative z-10">
        <div className="flex items-center justify-center gap-3 sm:gap-4">
          {/* Chat icon */}
          <div className="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-full flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform duration-200">
            <svg
              className="w-5 h-5 sm:w-6 sm:h-6 text-[#D41216]"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12zM7 9h2v2H7V9zm4 0h2v2h-2V9zm4 0h2v2h-2V9z" />
            </svg>
          </div>

          {/* Text */}
          <p className="text-white text-[13px] sm:text-[15px] lg:text-[17px] font-medium tracking-tight leading-snug">
            VERIFIQUE A{' '}
            <span className="font-extrabold">COMPATIBILIDADE</span>{' '}
            DE SUA PEÇA PELO CHAT.
          </p>
        </div>
      </div>
    </a>
  );
}
