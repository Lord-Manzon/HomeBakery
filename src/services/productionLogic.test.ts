import {
  buildDeductionLinesForItem,
  buildIngredientRequirements,
  calculateProductionProgress,
  computeIngredientAmount,
  countLowIngredientsForRow,
  getInsufficientIngredientsForRow,
  getProductionIngredientStatus,
  groupProductionItems,
  groupProductionItemsByDate,
  isEveryItemDone,
  type ProductionRecipeIngredient,
  type ProductionSourceItem,
} from './productionLogic';

function makeItem(overrides: Partial<ProductionSourceItem> = {}): ProductionSourceItem {
  return {
    orderItemId: 'item-1',
    productId: 'product-1',
    variantId: 'variant-1',
    productName: 'Chocolate Cake',
    variantName: 'Regular',
    quantity: 1,
    productionStatus: 'pending',
    notes: null,
    scheduledDate: '2026-08-25',
    recipePortion: 1,
    recipeIngredients: [],
    ...overrides,
  };
}

const flour: ProductionRecipeIngredient = {
  ingredientId: 'flour',
  ingredientName: 'All-purpose flour',
  unit: 'kg',
  currentStock: 2.5,
  lowStockThreshold: 1,
  quantityPerBatch: 1,
};

const cocoa: ProductionRecipeIngredient = {
  ingredientId: 'cocoa',
  ingredientName: 'Cocoa powder',
  unit: 'g',
  currentStock: 500,
  lowStockThreshold: 400,
  quantityPerBatch: 400,
};

describe('computeIngredientAmount', () => {
  it('multiplies quantity-per-batch × recipe_portion × units ordered', () => {
    expect(computeIngredientAmount(2, 0.25, 4)).toBe(2); // 1 full batch's worth
  });

  it('returns 0 when recipe_portion is null (no recipe linked yet)', () => {
    expect(computeIngredientAmount(2, null, 4)).toBe(0);
  });
});

describe('getProductionIngredientStatus', () => {
  it('is "insufficient" when on-hand can\'t cover this batch, even above the low-stock threshold', () => {
    // Matches the approved mockup's cocoa powder row: 500g on hand, 760g needed.
    expect(getProductionIngredientStatus(500, 760, 400)).toBe('insufficient');
  });

  it('is "low" when on-hand covers the batch but is at/below the low-stock threshold', () => {
    // Matches the mockup's sugar row: 1.2kg on hand, 1.1kg needed, already low.
    expect(getProductionIngredientStatus(1.2, 1.1, 1.2)).toBe('low');
  });

  it('is "enough" when on-hand covers the batch and is above the threshold', () => {
    // Matches the mockup's eggs row: 36 on hand, 22 needed.
    expect(getProductionIngredientStatus(36, 22, 10)).toBe('enough');
  });

  it('is "enough" when there is no low-stock threshold set at all', () => {
    expect(getProductionIngredientStatus(10, 5, null)).toBe('enough');
  });
});

describe('groupProductionItems', () => {
  it('sums quantity across multiple order_items sharing the same product+variant', () => {
    const items = [
      makeItem({ orderItemId: 'a', quantity: 2 }),
      makeItem({ orderItemId: 'b', quantity: 3 }),
    ];
    const rows = groupProductionItems(items);
    expect(rows).toHaveLength(1);
    expect(rows[0].totalQuantity).toBe(5);
    expect(rows[0].orderItemIds.sort()).toEqual(['a', 'b']);
  });

  it('keeps different variants of the same product as separate rows', () => {
    const items = [
      makeItem({ orderItemId: 'a', variantId: 'small' }),
      makeItem({ orderItemId: 'b', variantId: 'large' }),
    ];
    expect(groupProductionItems(items)).toHaveLength(2);
  });

  it('is done only when every underlying order_item is done', () => {
    const allDone = groupProductionItems([
      makeItem({ orderItemId: 'a', productionStatus: 'done' }),
      makeItem({ orderItemId: 'b', productionStatus: 'done' }),
    ]);
    expect(allDone[0].isDone).toBe(true);

    const partial = groupProductionItems([
      makeItem({ orderItemId: 'a', productionStatus: 'done' }),
      makeItem({ orderItemId: 'b', productionStatus: 'pending' }),
    ]);
    expect(partial[0].isDone).toBe(false);
  });

  it('shows a note only when every item that has one agrees on the same text', () => {
    const agreeing = groupProductionItems([
      makeItem({ orderItemId: 'a', notes: 'Less sweet' }),
      makeItem({ orderItemId: 'b', notes: 'Less sweet' }),
    ]);
    expect(agreeing[0].note).toBe('Less sweet');

    const conflicting = groupProductionItems([
      makeItem({ orderItemId: 'a', notes: 'Less sweet' }),
      makeItem({ orderItemId: 'b', notes: 'Extra cheese' }),
    ]);
    expect(conflicting[0].note).toBeNull();
  });

  it('sorts alphabetically by product then variant name', () => {
    const rows = groupProductionItems([
      makeItem({ orderItemId: 'a', productId: 'p2', variantId: 'v1', productName: 'Ube Cupcake' }),
      makeItem({ orderItemId: 'b', productId: 'p1', variantId: 'v1', productName: 'Banana Bread' }),
    ]);
    expect(rows.map((r) => r.productName)).toEqual(['Banana Bread', 'Ube Cupcake']);
  });
});

describe('groupProductionItemsByDate', () => {
  it('buckets items by scheduled_date and sorts dates ascending', () => {
    const items = [
      makeItem({ orderItemId: 'a', scheduledDate: '2026-08-29' }),
      makeItem({ orderItemId: 'b', scheduledDate: '2026-08-27', productId: 'p2', variantId: 'v2' }),
    ];
    const grouped = groupProductionItemsByDate(items);
    expect(grouped.map((g) => g.date)).toEqual(['2026-08-27', '2026-08-29']);
    expect(grouped[0].rows).toHaveLength(1);
  });
});

describe('calculateProductionProgress', () => {
  it('counts rows, not raw order_items', () => {
    const rows = groupProductionItems([
      makeItem({ orderItemId: 'a', productionStatus: 'done' }),
      makeItem({ orderItemId: 'b', productionStatus: 'done' }), // same row, aggregated
      makeItem({ orderItemId: 'c', productId: 'p2', variantId: 'v2', productionStatus: 'pending' }),
    ]);
    const progress = calculateProductionProgress(rows);
    expect(progress).toEqual({ completed: 1, total: 2, percent: 50 });
  });

  it('is 0% (not NaN) for an empty list', () => {
    expect(calculateProductionProgress([])).toEqual({ completed: 0, total: 0, percent: 0 });
  });
});

describe('buildIngredientRequirements + countLowIngredientsForRow', () => {
  it('sums one ingredient shared across two different products before resolving status', () => {
    // Two products each using 400g cocoa for 1 unit; only 500g on hand --
    // fine individually, but insufficient once summed.
    const rows = groupProductionItems([
      makeItem({
        orderItemId: 'a',
        productId: 'p1',
        variantId: 'v1',
        productName: 'Brownies',
        recipeIngredients: [cocoa],
      }),
      makeItem({
        orderItemId: 'b',
        productId: 'p2',
        variantId: 'v2',
        productName: 'Chocolate Cake',
        recipeIngredients: [cocoa],
      }),
    ]);

    const requirements = buildIngredientRequirements(rows);
    expect(requirements).toHaveLength(1);
    expect(requirements[0].amountNeeded).toBe(800); // 400 + 400
    expect(requirements[0].status).toBe('insufficient'); // 500 on hand < 800 needed

    const statusMap = new Map(requirements.map((r) => [r.ingredientId, r.status]));
    for (const row of rows) {
      expect(countLowIngredientsForRow(row, statusMap)).toBe(1);
    }
  });

  it('excludes ingredients from variants with no recipe linked (recipe_portion null)', () => {
    const rows = groupProductionItems([
      makeItem({ recipePortion: null, recipeIngredients: [flour] }),
    ]);
    expect(buildIngredientRequirements(rows)).toHaveLength(0);
  });
});

describe('buildDeductionLinesForItem', () => {
  it('scales each recipe ingredient by this item\'s own quantity, not the whole row\'s', () => {
    const item = makeItem({ quantity: 4, recipePortion: 0.25, recipeIngredients: [flour] });
    const lines = buildDeductionLinesForItem(item);
    expect(lines).toEqual([{ ingredientId: 'flour', amount: 1 }]); // 1 × 0.25 × 4
  });

  it('returns no lines when recipe_portion is null', () => {
    const item = makeItem({ recipePortion: null, recipeIngredients: [flour] });
    expect(buildDeductionLinesForItem(item)).toEqual([]);
  });
});

describe('getInsufficientIngredientsForRow', () => {
  it('flags an ingredient whose current stock is below what this row needs', () => {
    // cocoa: 500g on hand, needs 400g × 1 unit = 400g -- fine on its own,
    // but flour (2.5kg on hand, needs only 1kg here) is not short.
    const rows = groupProductionItems([makeItem({ recipeIngredients: [cocoa, flour] })]);
    const shortfalls = getInsufficientIngredientsForRow(rows[0]);
    expect(shortfalls).toEqual([]);
  });

  it('flags it when the row\'s own quantity pushes the need past current stock', () => {
    // cocoa: 500g on hand, quantity 2 -> needs 800g for this row alone.
    const rows = groupProductionItems([
      makeItem({ quantity: 2, recipePortion: 1, recipeIngredients: [cocoa] }),
    ]);
    const shortfalls = getInsufficientIngredientsForRow(rows[0]);
    expect(shortfalls).toEqual([
      { ingredientId: 'cocoa', name: 'Cocoa powder', unit: 'g', currentStock: 500, amountNeeded: 800 },
    ]);
  });

  it('ignores ingredients from a variant with no recipe linked', () => {
    const rows = groupProductionItems([
      makeItem({ recipePortion: null, recipeIngredients: [cocoa] }),
    ]);
    expect(getInsufficientIngredientsForRow(rows[0])).toEqual([]);
  });
});

describe('isEveryItemDone', () => {
  it('is false for an empty list -- nothing to be "done"', () => {
    expect(isEveryItemDone([])).toBe(false);
  });

  it('is true only when every status is done', () => {
    expect(isEveryItemDone(['done', 'done'])).toBe(true);
    expect(isEveryItemDone(['done', 'pending'])).toBe(false);
  });
});
