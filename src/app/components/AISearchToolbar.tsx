import React from 'react';
import { Search, Sparkles } from 'lucide-react';

interface AISearchToolbarProps {
  query: string;
  setQuery: (val: string) => void;
  aiMode: boolean;
  setAiMode: (val: boolean) => void;
  onSubmit: (e: React.FormEvent) => void;
  onFocusChange?: (focused: boolean) => void;
  placeholder?: string;
  aiPlaceholder?: string;
  className?: string;
}

export function AISearchToolbar({
  query,
  setQuery,
  aiMode,
  setAiMode,
  onSubmit,
  onFocusChange,
  placeholder = 'Buscar peças, acessórios...',
  aiPlaceholder = 'Descreva o que você precisa...',
  className = '',
}: AISearchToolbarProps) {
  const [isFocused, setIsFocused] = React.useState(false);

  return (
    <form onSubmit={onSubmit} className={`w-full ${className}`}>
      <div className={`relative flex items-center rounded-full h-[56px] sm:h-[62px] pl-5 pr-3 gap-2.5 transition-all duration-500 z-[60] ${
        aiMode
          ? 'ai-search-active bg-white ring-4 ring-purple-500/10 shadow-2xl shadow-purple-500/20'
          : isFocused
            ? 'bg-white ring-4 ring-primary/5 shadow-2xl shadow-black/10'
            : 'bg-card/90 backdrop-blur-xl border border-border/60 shadow-[0_8px_30px_-6px_rgba(0,0,0,0.08),0_2px_8px_-2px_rgba(0,0,0,0.04)]'
      }`}>
        <div className="relative flex-shrink-0 w-[20px] h-[20px]">
          <Search className={`absolute inset-0 w-[20px] h-[20px] text-muted-foreground transition-all duration-500 ${
            aiMode ? 'opacity-0 scale-75 rotate-[-90deg]' : 'opacity-100 scale-100 rotate-0'
          }`} />
          <Sparkles className={`absolute inset-0 w-[20px] h-[20px] text-purple-500 transition-all duration-500 ${
            aiMode ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-75 rotate-90'
          }`} />
        </div>
        <input
          type="search"
          enterKeyHint="search"
          placeholder={aiMode ? aiPlaceholder : placeholder}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => {
            setIsFocused(true);
          }}
          onBlur={() => {
            setIsFocused(false);
          }}
          className="flex-1 bg-transparent text-[16px] sm:text-base text-foreground placeholder:text-muted-foreground/40 outline-none min-w-0 font-medium h-full"
        />
        <button
          type="button"
          onClick={() => setAiMode(!aiMode)}
          className={`flex items-center gap-1.5 rounded-full px-3 h-[34px] text-[11px] font-semibold transition-all duration-500 flex-shrink-0 cursor-pointer ${
            aiMode
              ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white shadow-[0_2px_12px_-2px_rgba(139,92,246,0.5)]'
              : 'bg-[#f5f5f7] text-[#86868b] hover:bg-[#e8e8ed] hover:text-[#6e6e73]'
          }`}
        >
          <Sparkles className={`w-3.5 h-3.5 transition-transform duration-500 ${aiMode ? 'animate-pulse' : ''}`} />
          <span className="tracking-wide">IA</span>
        </button>
      </div>
    </form>
  );
}
