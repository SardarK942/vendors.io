import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { z } from 'zod';
import { useFormErrors } from '@/hooks/useFormErrors';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  age: z.number().min(18, 'Must be 18+'),
});

describe('useFormErrors()', () => {
  it('returns empty errors initially', () => {
    const { result } = renderHook(() => useFormErrors());
    expect(result.current.errors).toEqual({});
    expect(result.current.total).toBe(0);
  });

  it('applies zod errors as field-keyed entries', () => {
    const { result } = renderHook(() => useFormErrors());
    const parsed = schema.safeParse({ name: '', email: 'not-an-email', age: 10 });

    act(() => {
      if (!parsed.success) result.current.applyZodErrors(parsed.error);
    });

    expect(result.current.total).toBe(3);
    expect(result.current.getError('name')).toBe('Name is required');
    expect(result.current.getError('email')).toBe('Invalid email');
    expect(result.current.getError('age')).toBe('Must be 18+');
  });

  it('clearField removes one error without touching others', () => {
    const { result } = renderHook(() => useFormErrors());
    const parsed = schema.safeParse({ name: '', email: 'bad', age: 5 });
    act(() => {
      if (!parsed.success) result.current.applyZodErrors(parsed.error);
    });

    act(() => {
      result.current.clearField('name');
    });

    expect(result.current.getError('name')).toBeUndefined();
    expect(result.current.getError('email')).toBe('Invalid email');
    expect(result.current.total).toBe(2);
  });

  it('clearAll wipes everything', () => {
    const { result } = renderHook(() => useFormErrors());
    const parsed = schema.safeParse({ name: '', email: 'bad', age: 5 });
    act(() => {
      if (!parsed.success) result.current.applyZodErrors(parsed.error);
    });

    act(() => {
      result.current.clearAll();
    });

    expect(result.current.total).toBe(0);
  });
});
