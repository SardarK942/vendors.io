-- RPC used by mint-tokens.ts to safely apply an operator-supplied filter.
-- This is service-role-only by design; the function exists so the CLI can
-- pass an arbitrary WHERE fragment without manually constructing SQL.
-- The forbidden-keyword guard is a belt-and-suspenders check; the real
-- defense is the GRANT scope (service_role only).

CREATE OR REPLACE FUNCTION select_scraped_vendors_for_mint(p_where text)
RETURNS TABLE (id uuid, business_name text, instagram_handle text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q text;
BEGIN
  IF p_where ~* '\b(drop|truncate|delete|update|insert|alter|grant|revoke)\b' THEN
    RAISE EXCEPTION 'forbidden keyword in filter';
  END IF;
  q := 'SELECT id, business_name, instagram_handle FROM scraped_vendors '
       || 'WHERE claimed_at IS NULL AND (' || p_where || ')';
  RETURN QUERY EXECUTE q;
END;
$$;

REVOKE EXECUTE ON FUNCTION select_scraped_vendors_for_mint FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION select_scraped_vendors_for_mint TO service_role;
