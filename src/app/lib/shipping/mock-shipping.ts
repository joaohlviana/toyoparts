// ─── Mock Shipping Calculator ───────────────────────────────────────────────
// Drop-in replacement: swap this with a real API integration later.
// Implements the ShippingCalculator contract.

import type { ShippingCalculator, ShippingInput, ShippingQuote } from './shipping-types';

export const mockShippingCalculator: ShippingCalculator = {
  async calculate(input: ShippingInput): Promise<ShippingQuote[]> {
    // Simulate network delay
    await new Promise(r => setTimeout(r, 800 + Math.random() * 400));

    const cepNum = parseInt(input.cep.replace(/\D/g, ''), 10);
    if (isNaN(cepNum) || input.cep.replace(/\D/g, '').length !== 8) {
      throw new Error('CEP inválido');
    }

    // Calculate total weight and value for price estimation
    const totalValue = input.items.reduce((s, i) => s + i.price * i.qty, 0);
    const totalWeight = input.items.reduce((s, i) => s + (i.weight || 0.5) * i.qty, 0);

    // Base cost varies by region (mock)
    const baseCost = totalWeight * 2.5 + totalValue * 0.02;

    // Free shipping for orders > R$ 299
    const freeShippingEligible = totalValue >= 299;

    const quotes: ShippingQuote[] = [
      {
        id: 'pac',
        carrier: 'Correios',
        name: 'PAC',
        price: freeShippingEligible ? 0 : Math.round((baseCost + 12) * 100) / 100,
        estimatedDays: Math.floor(Math.random() * 3) + 7,
      },
      {
        id: 'sedex',
        carrier: 'Correios',
        name: 'SEDEX',
        price: Math.round((baseCost + 28) * 100) / 100,
        estimatedDays: Math.floor(Math.random() * 2) + 3,
      },
    ];

    // Add express option for high-value orders
    if (totalValue >= 150) {
      quotes.push({
        id: 'sedex10',
        carrier: 'Correios',
        name: 'SEDEX 10',
        price: Math.round((baseCost + 45) * 100) / 100,
        estimatedDays: 2,
      });
    }

    return quotes;
  },
};
