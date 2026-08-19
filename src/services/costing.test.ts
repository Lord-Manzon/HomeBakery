import {
  calculateActualMarginPercent,
  calculateProfit,
  calculateRecipeBatchCost,
  calculateSuggestedPrice,
  calculateVariantCost,
  resolveMarginPercent,
} from './costing';

describe('resolveMarginPercent', () => {
  it('uses variant margin when set, even if 0', () => {
    expect(
      resolveMarginPercent({ margin_percent: 0 }, { margin_percent: 40 }, { margin_percent: 35 }, {
        default_margin_percent: 30,
      })
    ).toBe(0);
  });

  it('falls through to product margin when variant is null', () => {
    expect(
      resolveMarginPercent({ margin_percent: null }, { margin_percent: 40 }, { margin_percent: 35 }, {
        default_margin_percent: 30,
      })
    ).toBe(40);
  });

  it('falls through to recipe margin when variant and product are null', () => {
    expect(
      resolveMarginPercent({ margin_percent: null }, { margin_percent: null }, { margin_percent: 35 }, {
        default_margin_percent: 30,
      })
    ).toBe(35);
  });

  it('falls all the way through to the baker default', () => {
    expect(
      resolveMarginPercent({ margin_percent: null }, null, null, { default_margin_percent: 30 })
    ).toBe(30);
  });

  it('falls through to baker default when product/recipe exist but their margin is null', () => {
    expect(
      resolveMarginPercent(
        { margin_percent: null },
        { margin_percent: null },
        { margin_percent: null },
        { default_margin_percent: 30 }
      )
    ).toBe(30);
  });
});

describe('calculateRecipeBatchCost', () => {
  it('sums quantity × cost_per_unit across all recipe ingredients', () => {
    const recipe = {
      ingredients: [
        { quantity: 500, ingredient: { cost_per_unit: 0.08 } }, // flour: 500g @ ₱0.08/g = ₱40
        { quantity: 4, ingredient: { cost_per_unit: 15 } }, // eggs: 4 @ ₱15 = ₱60
      ],
    };
    expect(calculateRecipeBatchCost(recipe)).toBe(100);
  });

  it('is 0 for a recipe with no ingredients yet', () => {
    expect(calculateRecipeBatchCost({ ingredients: [] })).toBe(0);
  });
});

describe('calculateVariantCost', () => {
  const recipe = {
    ingredients: [{ quantity: 1000, ingredient: { cost_per_unit: 0.1 } }], // batch cost = ₱100
  };

  it('scales the batch cost by recipe_portion and adds packaging', () => {
    // quarter of a ₱100 batch (₱25) + ₱10 packaging = ₱35
    expect(calculateVariantCost(recipe, { recipe_portion: 0.25, packaging_cost: 10 })).toBe(35);
  });

  it('is just packaging cost when no recipe is linked yet', () => {
    expect(calculateVariantCost(null, { recipe_portion: null, packaging_cost: 12 })).toBe(12);
  });

  it('is just packaging cost when a recipe is linked but recipe_portion is not set', () => {
    expect(calculateVariantCost(recipe, { recipe_portion: null, packaging_cost: 12 })).toBe(12);
  });
});

describe('calculateSuggestedPrice', () => {
  it('divides cost by (1 − margin%)', () => {
    // cost ₱70, margin 30% -> 70 / 0.7 = 100
    expect(calculateSuggestedPrice(70, 30)).toBeCloseTo(100);
  });

  it('returns null at exactly 100% margin (divide by zero)', () => {
    expect(calculateSuggestedPrice(50, 100)).toBeNull();
  });

  it('returns null above 100% margin (would go negative)', () => {
    expect(calculateSuggestedPrice(50, 150)).toBeNull();
  });

  it('is just the cost at 0% margin', () => {
    expect(calculateSuggestedPrice(42, 0)).toBeCloseTo(42);
  });
});

describe('calculateProfit', () => {
  it('is selling price minus cost', () => {
    expect(calculateProfit(150, 90)).toBe(60);
  });

  it('is negative when selling below cost', () => {
    expect(calculateProfit(50, 90)).toBe(-40);
  });
});

describe('calculateActualMarginPercent', () => {
  it('matches the target margin when priced exactly at suggested_price', () => {
    const cost = 70;
    const suggested = calculateSuggestedPrice(cost, 30)!;
    expect(calculateActualMarginPercent(suggested, cost)).toBeCloseTo(30);
  });

  it('is negative when the baker overrides the price below cost', () => {
    expect(calculateActualMarginPercent(50, 90)).toBeCloseTo(-80);
  });

  it('returns null at a zero or negative selling price (would divide by zero)', () => {
    expect(calculateActualMarginPercent(0, 50)).toBeNull();
  });
});
