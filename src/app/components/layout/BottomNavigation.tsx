import React from 'react';
import { Home, Search, Grid, ShoppingCart } from 'lucide-react';
import { useLocation } from 'react-router';
import { motion } from 'motion/react';
import { useCart } from '../../lib/cart/cart-store';

interface BottomNavigationProps {
  onNavigate: (page: 'home' | 'search' | 'departments' | 'cart' | 'account' | 'search-overlay' | 'atendimento') => void;
  activePage: 'home' | 'search' | 'admin' | 'products';
}

export function BottomNavigation({ onNavigate, activePage }: BottomNavigationProps) {
  const location = useLocation();
  const { totals } = useCart();
  
  const navItems = [
    { id: 'home', label: 'Home', icon: Home, path: '/' },
    { id: 'search-overlay', label: 'Menu', icon: Grid, action: true },
    { id: 'search', label: 'Busca', icon: Search, path: '/busca' },
    { id: 'cart', label: 'Carrinho', icon: ShoppingCart, badge: totals.totalQty },
    { id: 'atendimento', label: 'Atendimento', icon: Home, action: true },
  ];

  const isActive = (item: typeof navItems[0]) => {
    if (item.action) return false;
    if (item.path === '/') return location.pathname === '/';
    return location.pathname.startsWith(item.path || '___');
  };

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-2xl border-t border-black/[0.05] pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-[56px] px-2">
        {navItems.map((item) => {
          const active = isActive(item);
          const Icon = item.icon;
          
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id === 'search' ? 'search-overlay' : item.id as any)}
              className="relative flex flex-col items-center justify-center flex-1 h-full gap-1 active:scale-90 transition-transform duration-200"
            >
              <div className="relative flex items-center justify-center">
                {item.id === 'atendimento' ? (
                  <div className="w-12 h-12 bg-[#25D366] rounded-full flex items-center justify-center shadow-xl shadow-[#25D366]/40 -translate-y-3">
                    <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                    </svg>
                  </div>
                ) : (
                  <Icon 
                    className={`w-6 h-6 transition-colors duration-300 ${active ? 'text-primary' : 'text-[#86868b]'}`} 
                    strokeWidth={active ? 2.5 : 2}
                  />
                )}

                {item.badge !== undefined && item.badge > 0 && (
                  <motion.span 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] flex items-center justify-center bg-primary text-white text-[10px] font-bold rounded-full px-1 border-2 border-white"
                  >
                    {item.badge}
                  </motion.span>
                )}
                {active && item.id !== 'atendimento' && (
                  <motion.div 
                    layoutId="nav-indicator"
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full"
                  />
                )}
              </div>
              <span className={`text-[10px] font-medium transition-colors duration-300 ${active ? 'text-primary' : 'text-[#86868b]'}`}>
                {item.id === 'atendimento' ? '' : item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}