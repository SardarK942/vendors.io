import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { HttpError } from '@/lib/api/error-boundary';

const requireUser = vi.fn();
vi.mock('@/lib/api/auth', () => ({ requireUser: () => requireUser() }));

vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ ok: true }) }));

const addItem = vi.fn();
const updateItem = vi.fn();
const removeItem = vi.fn();
const getCartsForBuyer = vi.fn();
vi.mock('@/services/cart.service', () => ({
  addItem: (...a: unknown[]) => addItem(...a),
  updateItem: (...a: unknown[]) => updateItem(...a),
  removeItem: (...a: unknown[]) => removeItem(...a),
  getCartsForBuyer: (...a: unknown[]) => getCartsForBuyer(...a),
}));

import { GET } from '@/app/api/cart/route';
import { POST } from '@/app/api/cart/items/route';
import { PATCH, DELETE } from '@/app/api/cart/items/[id]/route';

const sb = { tag: 'rls' };
const json = (method: string, body?: unknown) =>
  new NextRequest('http://localhost/api/cart/items', {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = { params: Promise.resolve({ id: 'item_1' }) };

beforeEach(() => {
  requireUser.mockResolvedValue({ user: { id: 'u1' }, supabase: sb });
  [addItem, updateItem, removeItem, getCartsForBuyer].forEach((m) => m.mockReset());
});

describe('POST /api/cart/items', () => {
  it('returns 401 when unauthenticated', async () => {
    requireUser.mockRejectedValue(new HttpError(401, 'Unauthorized'));
    const res = await POST(json('POST', { product_id: 'p', variant_id: 'v' }));
    expect(res.status).toBe(401);
    expect(addItem).not.toHaveBeenCalled();
  });

  it('calls addItem with mapped input and returns its status/data', async () => {
    addItem.mockResolvedValue({ data: { cartItemId: 'ci1' }, status: 201 });
    const res = await POST(json('POST', { product_id: 'p', variant_id: 'v', quantity: 2 }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ cartItemId: 'ci1' });
    expect(addItem).toHaveBeenCalledWith(sb, 'u1', {
      productId: 'p',
      variantId: 'v',
      quantity: 2,
    });
  });

  it('returns the service error and status', async () => {
    addItem.mockResolvedValue({ error: 'nope', status: 409 });
    const res = await POST(json('POST', { product_id: 'p', variant_id: 'v' }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'nope' });
  });

  it('rejects an invalid body with 400', async () => {
    const res = await POST(json('POST', { product_id: 'p' }));
    expect(res.status).toBe(400);
    expect(addItem).not.toHaveBeenCalled();
  });
});

describe('PATCH/DELETE /api/cart/items/[id]', () => {
  it('PATCH calls updateItem', async () => {
    updateItem.mockResolvedValue({ data: { updated: true }, status: 200 });
    const res = await PATCH(json('PATCH', { quantity: 3 }), ctx);
    expect(res.status).toBe(200);
    expect(updateItem).toHaveBeenCalledWith(sb, 'u1', 'item_1', { quantity: 3 });
  });

  it('DELETE calls removeItem', async () => {
    removeItem.mockResolvedValue({ data: { deleted: true }, status: 200 });
    const res = await DELETE(json('DELETE'), ctx);
    expect(res.status).toBe(200);
    expect(removeItem).toHaveBeenCalledWith(sb, 'u1', 'item_1');
  });
});

describe('GET /api/cart', () => {
  it('returns carts', async () => {
    getCartsForBuyer.mockResolvedValue({ data: [], status: 200 });
    const res = await GET(new NextRequest('http://localhost/api/cart'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
