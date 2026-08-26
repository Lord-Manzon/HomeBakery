import {
  calculateOrderTotals,
  canCancelOrder,
  isOrderActive,
  resolveStatusAfterMarking,
} from './orderLogic';

describe('calculateOrderTotals', () => {
  it('sums quantity × unit_price across items and adds the delivery fee', () => {
    const result = calculateOrderTotals(
      [
        { quantity: 2, unit_price: 450 },
        { quantity: 1, unit_price: 850 },
      ],
      100
    );
    expect(result.subtotal).toBe(1750);
    expect(result.total).toBe(1850);
  });

  it('defaults to a 0 total for an order with no items and no delivery fee', () => {
    expect(calculateOrderTotals([], 0)).toEqual({ subtotal: 0, total: 0 });
  });

  it('handles a delivery fee with no items', () => {
    expect(calculateOrderTotals([], 50)).toEqual({ subtotal: 0, total: 50 });
  });
});

describe('resolveStatusAfterMarking', () => {
  it('marking delivered while already paid completes the order', () => {
    expect(
      resolveStatusAfterMarking({ action: 'delivered', currentStatus: 'pending', willBePaid: true })
    ).toBe('completed');
  });

  it('marking paid while already delivered completes the order', () => {
    expect(
      resolveStatusAfterMarking({ action: 'paid', currentStatus: 'delivered', willBePaid: true })
    ).toBe('completed');
  });

  it('marking delivered while still unpaid moves to delivered, not completed', () => {
    expect(
      resolveStatusAfterMarking({ action: 'delivered', currentStatus: 'pending', willBePaid: false })
    ).toBe('delivered');
  });

  it('marking paid while not yet delivered stays at its current status', () => {
    expect(
      resolveStatusAfterMarking({ action: 'paid', currentStatus: 'pending', willBePaid: true })
    ).toBe('pending');
  });

  it('is a no-op on an already-completed order', () => {
    expect(
      resolveStatusAfterMarking({ action: 'paid', currentStatus: 'completed', willBePaid: true })
    ).toBe('completed');
  });

  it('is a no-op on a cancelled order', () => {
    expect(
      resolveStatusAfterMarking({ action: 'delivered', currentStatus: 'cancelled', willBePaid: true })
    ).toBe('cancelled');
  });
});

describe('canCancelOrder', () => {
  it('allows cancelling a pending order', () => {
    expect(canCancelOrder('pending')).toBe(true);
  });

  it('allows cancelling a delivered (but unpaid) order', () => {
    expect(canCancelOrder('delivered')).toBe(true);
  });

  it('does not allow cancelling a completed order', () => {
    expect(canCancelOrder('completed')).toBe(false);
  });

  it('does not allow cancelling an already-cancelled order', () => {
    expect(canCancelOrder('cancelled')).toBe(false);
  });
});

describe('isOrderActive', () => {
  it('treats pending and delivered as active', () => {
    expect(isOrderActive('pending')).toBe(true);
    expect(isOrderActive('delivered')).toBe(true);
  });

  it('treats completed and cancelled as not active', () => {
    expect(isOrderActive('completed')).toBe(false);
    expect(isOrderActive('cancelled')).toBe(false);
  });
});