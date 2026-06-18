import { useState, useCallback } from 'react';
import type { z } from 'zod';

export function useFormErrors() {
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});

  const applyZodErrors = useCallback((zodError: z.ZodError) => {
    setErrors(zodError.flatten().fieldErrors as Record<string, string[]>);
  }, []);

  const clearField = useCallback((name: string) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setErrors({});
  }, []);

  const getError = useCallback((name: string): string | undefined => errors[name]?.[0], [errors]);

  const total = Object.values(errors).filter((v) => v && v.length > 0).length;

  return { errors, applyZodErrors, clearField, clearAll, getError, total };
}
