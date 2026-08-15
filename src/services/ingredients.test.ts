import { calculateRestockCostPerUnit } from './ingredients';

describe('calculateRestockCostPerUnit', () => {
  it('blends existing stock value with the new purchase (weighted average)', () => {
    // 2kg on hand at ₱50/kg (₱100 value) + buy 3kg for ₱180 total
    // => (100 + 180) / (2 + 3) = 280 / 5 = 56
    expect(calculateRestockCostPerUnit(2, 50, 3, 180)).toBeCloseTo(56);
  });

  it('is simply the purchase price per unit when starting from zero stock', () => {
    // 0kg on hand, buy 4kg for ₱200 => 200 / 4 = 50
    expect(calculateRestockCostPerUnit(0, 0, 4, 200)).toBeCloseTo(50);
  });

  it('is unaffected by a restock of a different price when current stock is much larger', () => {
    // 100kg on hand at ₱40/kg (₱4000 value) + buy 1kg for ₱1000 (a spike)
    // => (4000 + 1000) / 101 ≈ 49.50 — the spike is heavily diluted
    expect(calculateRestockCostPerUnit(100, 40, 1, 1000)).toBeCloseTo(49.5, 1);
  });

  it('does not divide by zero when both current and added stock are zero', () => {
    expect(calculateRestockCostPerUnit(0, 25, 0, 0)).toBe(25);
  });

  it('handles a restock priced at exactly the existing cost per unit (no change)', () => {
    // 10kg at ₱20/kg + 5kg for ₱100 (same ₱20/kg) => stays ₱20/kg
    expect(calculateRestockCostPerUnit(10, 20, 5, 100)).toBeCloseTo(20);
  });
});
