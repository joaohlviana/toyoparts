// ─── Frenet Admin Module ─────────────────────────────────────────────────────
// Config, health check, CEP test, quote test

import React, { useState, useEffect, useCallback } from 'react';
import {
  Truck, Settings, Loader2, Save, RefreshCw,
  CheckCircle2, XCircle, MapPin, PackageCheck,
  DollarSign, Ruler, Weight, Calendar, Zap, Search,
  AlertTriangle, Info, Shield,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../base/button';
import { Card } from '../base/card';
import { Badge } from '../base/badge';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Separator } from '../ui/separator';
import {
  fetchFrenetConfig,
  saveFrenetConfig,
  testFrenetHealth,
  fetchCepAddress,
  fetchShippingQuote,
} from '../../lib/shipping/frenet-api';
import type { FrenetConfig } from '../../lib/shipping/shipping-types';
import { maskCEP } from '../../lib/checkout/checkout-validation';

export function FrenetAdmin() {
  const [config, setConfig] = useState<FrenetConfig | null>(null);
  const [status, setStatus] = useState<{ tokenConfigured: boolean; passConfigured: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [healthResult, setHealthResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [testingHealth, setTestingHealth] = useState(false);

  // CEP test
  const [testCep, setTestCep] = useState('');
  const [testCepResult, setTestCepResult] = useState<any>(null);
  const [testCepLoading, setTestCepLoading] = useState(false);
  const [testCepError, setTestCepError] = useState('');

  // Quote test
  const [quoteCep, setQuoteCep] = useState('');
  const [quoteValue, setQuoteValue] = useState('350');
  const [quoteWeight, setQuoteWeight] = useState('1.5');
  const [quoteResult, setQuoteResult] = useState<any>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');

  // Fetch config
  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchFrenetConfig();
      setConfig(data.config);
      setStatus(data.status);
    } catch (e: any) {
      console.error('FrenetAdmin: fetch config error:', e);
      toast.error('Erro ao carregar config Frenet');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  // Save config
  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const updated = await saveFrenetConfig(config);
      setConfig(updated);
      toast.success('Configuracao Frenet salva!');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Health test
  const handleTestHealth = async () => {
    setTestingHealth(true);
    setHealthResult(null);
    try {
      const res = await testFrenetHealth();
      setHealthResult(res);
      if (res.ok) toast.success('Conexao com Frenet OK!');
      else toast.error(`Falha: ${res.error || 'Desconhecido'}`);
    } catch (e: any) {
      setHealthResult({ ok: false, error: e.message });
      toast.error(e.message);
    } finally {
      setTestingHealth(false);
    }
  };

  // CEP test
  const handleTestCep = async () => {
    const clean = testCep.replace(/\D/g, '');
    if (clean.length !== 8) {
      setTestCepError('CEP deve ter 8 digitos');
      return;
    }
    setTestCepLoading(true);
    setTestCepError('');
    setTestCepResult(null);
    try {
      const data = await fetchCepAddress(clean);
      setTestCepResult(data);
    } catch (e: any) {
      setTestCepError(e.message);
    } finally {
      setTestCepLoading(false);
    }
  };

  // Quote test
  const handleTestQuote = async () => {
    const cep = quoteCep.replace(/\D/g, '');
    if (cep.length !== 8) {
      setQuoteError('CEP destino deve ter 8 digitos');
      return;
    }
    setQuoteLoading(true);
    setQuoteError('');
    setQuoteResult(null);
    try {
      const data = await fetchShippingQuote({
        recipientCep: cep,
        invoiceValue: parseFloat(quoteValue) || 100,
        items: [
          {
            sku: 'TEST-001',
            quantity: 1,
            weight: parseFloat(quoteWeight) || 1,
            height: config?.defaultHeight || 5,
            length: config?.defaultLength || 20,
            width: config?.defaultWidth || 15,
          },
        ],
      });
      setQuoteResult(data);
    } catch (e: any) {
      setQuoteError(e.message);
    } finally {
      setQuoteLoading(false);
    }
  };

  const update = (patch: Partial<FrenetConfig>) => {
    if (config) setConfig({ ...config, ...patch });
  };

  if (loading) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 lg:px-6 pt-6 pb-12">
        <div className="flex items-center gap-3 mb-6">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Carregando configuracao Frenet...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[1280px] mx-auto px-4 lg:px-6 pt-6 pb-12 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
            <Truck className="w-6 h-6" />
            Frenet — Frete
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure a integracao com a Frenet para calculo de frete e consulta de CEP.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button color="secondary" size="sm" onClick={loadConfig}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Recarregar
          </Button>
          <Button color="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1.5" />}
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card.Root>
          <Card.Content className="py-4 flex items-center gap-3">
            {status?.tokenConfigured ? (
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <XCircle className="w-5 h-5 text-red-500" />
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-foreground">Token Frenet</p>
              <p className="text-xs text-muted-foreground">
                {status?.tokenConfigured ? 'Configurado' : 'Nao configurado'}
              </p>
            </div>
          </Card.Content>
        </Card.Root>

        <Card.Root>
          <Card.Content className="py-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Senha Frenet</p>
              <p className="text-xs text-muted-foreground">
                {status?.passConfigured ? 'Configurada (armazenada)' : 'Nao configurada'}
              </p>
            </div>
          </Card.Content>
        </Card.Root>

        <Card.Root
          className={`cursor-pointer transition-all duration-200 group ${testingHealth ? 'pointer-events-none opacity-80' : 'hover:border-primary/40 hover:shadow-sm active:scale-[0.98]'}`}
          onClick={handleTestHealth}
        >
          <Card.Content className="py-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              testingHealth ? 'bg-primary/10' : 'bg-secondary/50 group-hover:bg-primary/10'
            }`}>
              {testingHealth ? (
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              ) : (
                <Zap className={`w-5 h-5 ${healthResult?.ok ? 'text-emerald-500' : 'text-blue-500 group-hover:text-primary'}`} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">Conexao</p>
              <p className={`text-xs truncate ${healthResult?.ok ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                {healthResult
                  ? healthResult.ok
                    ? 'API Frenet OK'
                    : `Falha: ${healthResult.error}`
                  : 'Clique para testar'}
              </p>
            </div>
            {healthResult && (
              <div className="animate-in zoom-in duration-300">
                {healthResult.ok
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  : <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />}
              </div>
            )}
          </Card.Content>
        </Card.Root>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Config Card */}
        <Card.Root>
          <Card.Header>
            <Card.Title className="flex items-center gap-2 text-base">
              <Settings className="w-4 h-4" /> Configuracao
            </Card.Title>
            <Card.Description>Parametros padroes usados nas cotacoes</Card.Description>
          </Card.Header>
          <Card.Content className="space-y-5">
            {config && (
              <>
                {/* Enabled Toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Frenet Ativado</Label>
                    <p className="text-xs text-muted-foreground">Habilita calculo real de frete</p>
                  </div>
                  <Switch checked={config.enabled} onCheckedChange={(v) => update({ enabled: v })} />
                </div>

                <Separator />

                {/* Seller CEP */}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    <MapPin className="w-3 h-3" /> CEP do Vendedor (origem)
                  </Label>
                  <Input
                    value={maskCEP(config.sellerCep)}
                    onChange={(e) => update({ sellerCep: e.target.value.replace(/\D/g, '') })}
                    placeholder="86026-010"
                    maxLength={9}
                  />
                </div>

                {/* Default dimensions */}
                <div>
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
                    Dimensoes Padrao (quando produto nao informa)
                  </Label>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1"><Weight className="w-3 h-3" /> Peso (kg)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        value={config.defaultWeight}
                        onChange={(e) => update({ defaultWeight: parseFloat(e.target.value) || 0.5 })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1"><Ruler className="w-3 h-3" /> Altura (cm)</Label>
                      <Input
                        type="number"
                        value={config.defaultHeight}
                        onChange={(e) => update({ defaultHeight: parseFloat(e.target.value) || 5 })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1"><Ruler className="w-3 h-3" /> Comprimento (cm)</Label>
                      <Input
                        type="number"
                        value={config.defaultLength}
                        onChange={(e) => update({ defaultLength: parseFloat(e.target.value) || 20 })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1"><Ruler className="w-3 h-3" /> Largura (cm)</Label>
                      <Input
                        type="number"
                        value={config.defaultWidth}
                        onChange={(e) => update({ defaultWidth: parseFloat(e.target.value) || 15 })}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Free shipping */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Frete Gratis</Label>
                    <p className="text-xs text-muted-foreground">Frete gratis para PAC acima do valor</p>
                  </div>
                  <Switch checked={config.freeShippingEnabled} onCheckedChange={(v) => update({ freeShippingEnabled: v })} />
                </div>

                {config.freeShippingEnabled && (
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                      <DollarSign className="w-3 h-3" /> Valor minimo (R$)
                    </Label>
                    <Input
                      type="number"
                      value={config.freeShippingThreshold}
                      onChange={(e) => update({ freeShippingThreshold: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                )}

                {/* Additional days */}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Dias adicionais ao prazo
                  </Label>
                  <Input
                    type="number"
                    value={config.additionalDays}
                    onChange={(e) => update({ additionalDays: parseInt(e.target.value) || 0 })}
                  />
                  <p className="text-[10px] text-muted-foreground">Soma dias extras ao prazo da Frenet (manuseio, despacho)</p>
                </div>
              </>
            )}
          </Card.Content>
        </Card.Root>

        {/* Test Tools */}
        <div className="space-y-6">
          {/* CEP Test */}
          <Card.Root>
            <Card.Header>
              <Card.Title className="flex items-center gap-2 text-base">
                <Search className="w-4 h-4" /> Teste de CEP
              </Card.Title>
              <Card.Description>Consulta endereco via Frenet</Card.Description>
            </Card.Header>
            <Card.Content className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  value={maskCEP(testCep)}
                  onChange={(e) => setTestCep(e.target.value.replace(/\D/g, ''))}
                  placeholder="01001-000"
                  maxLength={9}
                  className="flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && handleTestCep()}
                />
                <Button color="secondary" size="sm" onClick={handleTestCep} disabled={testCepLoading}>
                  {testCepLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                </Button>
              </div>
              {testCepError && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 text-red-600 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  {testCepError}
                </div>
              )}
              {testCepResult && (
                <div className="p-3 rounded-lg bg-secondary/50 text-xs space-y-1">
                  <p><span className="font-semibold">Rua:</span> {testCepResult.address.street}</p>
                  <p><span className="font-semibold">Bairro:</span> {testCepResult.address.district}</p>
                  <p><span className="font-semibold">Cidade:</span> {testCepResult.address.city} - {testCepResult.address.state}</p>
                </div>
              )}
            </Card.Content>
          </Card.Root>

          {/* Quote Test */}
          <Card.Root>
            <Card.Header>
              <Card.Title className="flex items-center gap-2 text-base">
                <PackageCheck className="w-4 h-4" /> Teste de Cotacao
              </Card.Title>
              <Card.Description>Simula cotacao com 1 item de teste</Card.Description>
            </Card.Header>
            <Card.Content className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px]">CEP Destino</Label>
                  <Input
                    value={maskCEP(quoteCep)}
                    onChange={(e) => setQuoteCep(e.target.value.replace(/\D/g, ''))}
                    placeholder="01001-000"
                    maxLength={9}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Valor (R$)</Label>
                  <Input
                    type="number"
                    value={quoteValue}
                    onChange={(e) => setQuoteValue(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Peso (kg)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={quoteWeight}
                    onChange={(e) => setQuoteWeight(e.target.value)}
                  />
                </div>
              </div>
              <Button color="secondary" size="sm" onClick={handleTestQuote} disabled={quoteLoading} className="w-full">
                {quoteLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Truck className="w-3.5 h-3.5 mr-1.5" />}
                Calcular Frete de Teste
              </Button>
              {quoteError && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 text-red-600 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                  {quoteError}
                </div>
              )}
              {quoteResult && (
                <div className="space-y-2">
                  {quoteResult.quotes.length === 0 && quoteResult.errors.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhuma opcao retornada.</p>
                  )}
                  {quoteResult.quotes.map((q: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-secondary/50 text-xs">
                      <div className="flex items-center gap-2">
                        <Truck className="w-3.5 h-3.5 text-muted-foreground" />
                        <div>
                          <p className="font-semibold text-foreground">{q.serviceDescription}</p>
                          <p className="text-muted-foreground">{q.carrier} — {q.deliveryDays} dias uteis</p>
                        </div>
                      </div>
                      <div className="text-right">
                        {q.freeShipping ? (
                          <Badge variant="pill-color" color="success" size="xs">Gratis</Badge>
                        ) : (
                          <span className="font-bold text-foreground">
                            R$ {q.price.toFixed(2).replace('.', ',')}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {quoteResult.errors.length > 0 && (
                    <div className="p-2 rounded-lg bg-amber-500/10 text-xs text-amber-700 space-y-1">
                      <p className="font-semibold flex items-center gap-1"><Info className="w-3 h-3" /> Servicos com erro:</p>
                      {quoteResult.errors.map((e: any, i: number) => (
                        <p key={i}>{e.serviceDescription}: {e.message || 'Erro desconhecido'}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card.Content>
          </Card.Root>
        </div>
      </div>
    </div>
  );
}
