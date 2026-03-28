import React from 'react';
import { Database, Globe, Sparkles } from 'lucide-react';
import { Badge } from '../components/ui/badge';
import { Card } from '../components/ui/card';
import { SEOSnapshotsTab } from './SEOAdminPage';

export function SnapshotAdminPage() {
  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 pt-6 pb-12 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" /> Sistema de Snapshots SEO
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Area dedicada para descobrir, gerar e acompanhar snapshots HTML das landings estrategicas de SEO,
            incluindo rotas publicas como <span className="font-mono text-foreground/80">/pecas/corolla</span> e
            <span className="font-mono text-foreground/80"> /pecas/corolla/acessorios-internos</span>.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-[10px]">Categorias</Badge>
          <Badge variant="outline" className="text-[10px]">Veiculos</Badge>
          <Badge variant="outline" className="text-[10px]">Veiculo x categoria</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Discovery</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Mapeia automaticamente todas as rotas com produto real no catalogo antes de qualquer geracao.
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Geracao</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Materializa snapshots HTML e reaproveita cache quando fizer sentido para acelerar o processo.
          </p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Globe className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Indexacao</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Confirma que as URLs canonicas publicas com snapshot entram no snapshot-sitemap.xml para auditoria simples e envio ao Search Console.
          </p>
        </Card>
      </div>

      <SEOSnapshotsTab standalone />
    </div>
  );
}
