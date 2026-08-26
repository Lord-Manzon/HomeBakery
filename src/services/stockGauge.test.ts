import { getStockGaugePercent, getStockGaugeStatus, gaugeSortValue } from './stockGauge';
import type { Ingredient } from '../types/ingredient';

describe('getStockGaugePercent', () => {
  it('returns null when no low_stock_threshold is set — no fabricated bar', () => {
    expect(getStockGaugePercent(40, null, 'balanced')).toBeNull();
  });

  it('returns null when the threshold is zero or negative (guards divide-by-zero)', () => {
    expect(getStockGaugePercent(10, 0, 'balanced')).toBeNull();
  });

  it('reads 100% once stock reaches threshold × multiplier (balanced = ×3)', () => {
    // threshold 3, ceiling = 9 -> 9/9 = 100%
    expect(getStockGaugePercent(9, 3, 'balanced')).toBe(100);
  });

  it('caps at 100% rather than overflowing when stock is well above the ceiling', () => {
    expect(getStockGaugePercent(50, 3, 'balanced')).toBe(100);
  });

  it('reads the same stock differently under each sensitivity', () => {
    // stock 7, threshold 3: tight ceiling=6 (caps 100), balanced ceiling=9 (78%), relaxed ceiling=12 (58%)
    expect(getStockGaugePercent(7, 3, 'tight')).toBe(100);
    expect(getStockGaugePercent(7, 3, 'balanced')).toBe(78);
    expect(getStockGaugePercent(7, 3, 'relaxed')).toBe(58);
  });

  it('reads 0% at zero stock', () => {
    expect(getStockGaugePercent(0, 3, 'balanced')).toBe(0);
  });
});

describe('getStockGaugeStatus', () => {
  it('is "none" when no threshold is set', () => {
    expect(getStockGaugeStatus(10, null)).toBe('none');
  });

  it('is "out" at zero or below', () => {
    expect(getStockGaugeStatus(0, 3)).toBe('out');
  });

  it('is "low" at or below the threshold, matching isLowStock()', () => {
    expect(getStockGaugeStatus(3, 3)).toBe('low');
    expect(getStockGaugeStatus(2, 3)).toBe('low');
  });

  it('is "ok" above the threshold', () => {
    expect(getStockGaugeStatus(4, 3)).toBe('ok');
  });
});

describe('gaugeSortValue', () => {
  const base: Ingredient = {
    id: '1',
    baker_id: 'b1',
    name: 'Test',
    category: null,
    unit: 'kg',
    current_stock: 0,
    cost_per_unit: 0,
    low_stock_threshold: null,
    is_active: true,
    created_at: '',
    updated_at: '',
  };

  it('sorts ingredients with no threshold last (101), not first', () => {
    const noThreshold = { ...base, current_stock: 0, low_stock_threshold: null };
    const lowStock = { ...base, current_stock: 1, low_stock_threshold: 5 };
    expect(gaugeSortValue(noThreshold, 'balanced')).toBeGreaterThan(
      gaugeSortValue(lowStock, 'balanced')
    );
  });
});
