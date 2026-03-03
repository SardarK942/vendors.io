-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Vendor profiles table
CREATE TABLE public.vendor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL CHECK (category IN (
    'photography', 'videography', 'mehndi', 'hair_makeup',
    'dj', 'photobooth', 'catering', 'venue', 'decor', 'invitations'
  )),
  bio TEXT,
  service_area TEXT[] DEFAULT ARRAY['Chicago'],
  starting_price_min INTEGER,      -- in cents
  starting_price_max INTEGER,      -- in cents
  portfolio_images TEXT[] DEFAULT ARRAY[]::TEXT[],
  instagram_handle TEXT,
  website_url TEXT,
  verified BOOLEAN DEFAULT FALSE,
  response_sla_hours INTEGER DEFAULT 48,
  total_bookings INTEGER DEFAULT 0,
  average_rating NUMERIC(3,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- AI search fields
  embedding VECTOR(1536),          -- OpenAI text-embedding-3-small
  searchable_text TEXT GENERATED ALWAYS AS (
    business_name || ' ' || COALESCE(bio, '') || ' ' || category
  ) STORED
);

-- Indexes
CREATE INDEX idx_vendor_profiles_category ON vendor_profiles(category);
CREATE INDEX idx_vendor_profiles_slug ON vendor_profiles(slug);
CREATE INDEX idx_vendor_profiles_user_id ON vendor_profiles(user_id);
CREATE INDEX idx_vendor_profiles_verified ON vendor_profiles(verified);

-- Vector search index (IVFFlat for cosine similarity)
CREATE INDEX idx_vendor_profiles_embedding ON vendor_profiles
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Full-text search index
CREATE INDEX idx_vendor_profiles_searchable_text ON vendor_profiles
  USING gin(to_tsvector('english', searchable_text));

-- RLS Policies
ALTER TABLE public.vendor_profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can view vendor profiles (public marketplace)
CREATE POLICY "Vendor profiles are publicly viewable"
  ON public.vendor_profiles FOR SELECT
  USING (true);

-- Vendors can update their own profile
CREATE POLICY "Vendors can update own profile"
  ON public.vendor_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Vendors can insert a profile (claim)
CREATE POLICY "Vendors can insert profile"
  ON public.vendor_profiles FOR INSERT
  WITH CHECK (true);

-- Admins can do anything
CREATE POLICY "Admins can manage all vendor profiles"
  ON public.vendor_profiles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
    )
  );
