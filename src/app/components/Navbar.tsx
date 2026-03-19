import React from 'react';
import { Button } from './ui/button';
import { Package, RefreshCw, Search } from 'lucide-react';

interface NavbarProps {
  currentPage: 'sync' | 'products' | 'search';
  onNavigate: (page: 'sync' | 'products' | 'search') => void;
}

export function Navbar({ currentPage, onNavigate }: NavbarProps) {
  return (
    <nav className="bg-card border-b border-border">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo/Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <Package className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Toyoparts</h1>
              <p className="text-xs text-muted-foreground">Sistema E-commerce</p>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="flex items-center gap-2">
            <Button
              variant={currentPage === 'search' ? 'default' : 'ghost'}
              onClick={() => onNavigate('search')}
              className="gap-2"
            >
              <Search className="w-4 h-4" />
              Busca
            </Button>

            <Button
              variant={currentPage === 'products' ? 'default' : 'ghost'}
              onClick={() => onNavigate('products')}
              className="gap-2"
            >
              <Package className="w-4 h-4" />
              Produtos
            </Button>

            <Button
              variant={currentPage === 'sync' ? 'default' : 'ghost'}
              onClick={() => onNavigate('sync')}
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Sync
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}