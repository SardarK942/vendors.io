/**
 * Manual database types matching the Supabase schema.
 * Replace with auto-generated types once Supabase project is live:
 *   npx supabase gen types typescript --local > src/types/database.types.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          phone: string | null;
          role: 'couple' | 'vendor' | 'admin';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          phone?: string | null;
          role: 'couple' | 'vendor' | 'admin';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          phone?: string | null;
          role?: 'couple' | 'vendor' | 'admin';
          updated_at?: string;
        };
        Relationships: [];
      };
      vendor_profiles: {
        Row: {
          id: string;
          user_id: string;
          business_name: string;
          slug: string;
          category: string;
          bio: string | null;
          service_area: string[];
          starting_price_min: number | null;
          starting_price_max: number | null;
          portfolio_images: string[];
          instagram_handle: string | null;
          website_url: string | null;
          verified: boolean;
          response_sla_hours: number;
          total_bookings: number;
          average_rating: number | null;
          review_count: number;
          searchable_text: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          business_name: string;
          slug: string;
          category: string;
          bio?: string | null;
          service_area?: string[];
          starting_price_min?: number | null;
          starting_price_max?: number | null;
          portfolio_images?: string[];
          instagram_handle?: string | null;
          website_url?: string | null;
          verified?: boolean;
          response_sla_hours?: number;
          total_bookings?: number;
          average_rating?: number | null;
          review_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          business_name?: string;
          slug?: string;
          category?: string;
          bio?: string | null;
          service_area?: string[];
          starting_price_min?: number | null;
          starting_price_max?: number | null;
          portfolio_images?: string[];
          instagram_handle?: string | null;
          website_url?: string | null;
          verified?: boolean;
          response_sla_hours?: number;
          total_bookings?: number;
          average_rating?: number | null;
          review_count?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vendor_profiles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      booking_requests: {
        Row: {
          id: string;
          couple_user_id: string;
          vendor_profile_id: string;
          event_date: string;
          event_type: string;
          guest_count: number | null;
          budget_min: number | null;
          budget_max: number | null;
          special_requests: string | null;
          status: string;
          vendor_quote_amount: number | null;
          vendor_quote_notes: string | null;
          vendor_responded_at: string | null;
          deposit_amount: number | null;
          deposit_paid_at: string | null;
          stripe_payment_intent_id: string | null;
          couple_contact_revealed: boolean;
          couple_phone: string | null;
          couple_email: string | null;
          expires_at: string | null;
          completed_at: string | null;
          cancelled_at: string | null;
          cancellation_reason: string | null;
          cancellation_fault: 'none' | 'vendor_fault' | 'force_majeure' | null;
          disputed_at: string | null;
          dispute_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          couple_user_id: string;
          vendor_profile_id: string;
          event_date: string;
          event_type: string;
          guest_count?: number | null;
          budget_min?: number | null;
          budget_max?: number | null;
          special_requests?: string | null;
          status?: string;
          vendor_quote_amount?: number | null;
          vendor_quote_notes?: string | null;
          vendor_responded_at?: string | null;
          deposit_amount?: number | null;
          deposit_paid_at?: string | null;
          stripe_payment_intent_id?: string | null;
          couple_contact_revealed?: boolean;
          couple_phone?: string | null;
          couple_email?: string | null;
          expires_at?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          cancellation_fault?: 'none' | 'vendor_fault' | 'force_majeure' | null;
          disputed_at?: string | null;
          dispute_reason?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          couple_user_id?: string;
          vendor_profile_id?: string;
          event_date?: string;
          event_type?: string;
          guest_count?: number | null;
          budget_min?: number | null;
          budget_max?: number | null;
          special_requests?: string | null;
          status?: string;
          vendor_quote_amount?: number | null;
          vendor_quote_notes?: string | null;
          vendor_responded_at?: string | null;
          deposit_amount?: number | null;
          deposit_paid_at?: string | null;
          stripe_payment_intent_id?: string | null;
          couple_contact_revealed?: boolean;
          couple_phone?: string | null;
          couple_email?: string | null;
          expires_at?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          cancellation_fault?: 'none' | 'vendor_fault' | 'force_majeure' | null;
          disputed_at?: string | null;
          dispute_reason?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'booking_requests_couple_user_id_fkey';
            columns: ['couple_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'booking_requests_vendor_profile_id_fkey';
            columns: ['vendor_profile_id'];
            isOneToOne: false;
            referencedRelation: 'vendor_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      stripe_accounts: {
        Row: {
          id: string;
          vendor_profile_id: string;
          stripe_account_id: string;
          onboarding_complete: boolean;
          payouts_enabled: boolean;
          charges_enabled: boolean;
          minimal_created_at: string | null;
          frozen_reason: 'no_show_strikes' | 'admin_freeze' | null;
          frozen_at: string | null;
          no_show_count_year: number;
          no_show_year: number | null;
          details_submitted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vendor_profile_id: string;
          stripe_account_id: string;
          onboarding_complete?: boolean;
          payouts_enabled?: boolean;
          charges_enabled?: boolean;
          minimal_created_at?: string | null;
          frozen_reason?: 'no_show_strikes' | 'admin_freeze' | null;
          frozen_at?: string | null;
          no_show_count_year?: number;
          no_show_year?: number | null;
          details_submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          vendor_profile_id?: string;
          stripe_account_id?: string;
          onboarding_complete?: boolean;
          payouts_enabled?: boolean;
          charges_enabled?: boolean;
          minimal_created_at?: string | null;
          frozen_reason?: 'no_show_strikes' | 'admin_freeze' | null;
          frozen_at?: string | null;
          no_show_count_year?: number;
          no_show_year?: number | null;
          details_submitted_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'stripe_accounts_vendor_profile_id_fkey';
            columns: ['vendor_profile_id'];
            isOneToOne: true;
            referencedRelation: 'vendor_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      transactions: {
        Row: {
          id: string;
          booking_request_id: string;
          stripe_payment_intent_id: string;
          amount: number;
          platform_fee: number;
          vendor_payout: number;
          status: string;
          platform_fee_recognized_at: string | null;
          vendor_earned_at: string | null;
          refunded_at: string | null;
          refund_amount_cents: number;
          transferred_at: string | null;
          stripe_refund_id: string | null;
          stripe_transfer_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          booking_request_id: string;
          stripe_payment_intent_id: string;
          amount: number;
          platform_fee: number;
          vendor_payout: number;
          status?: string;
          platform_fee_recognized_at?: string | null;
          vendor_earned_at?: string | null;
          refunded_at?: string | null;
          refund_amount_cents?: number;
          transferred_at?: string | null;
          stripe_refund_id?: string | null;
          stripe_transfer_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          booking_request_id?: string;
          stripe_payment_intent_id?: string;
          amount?: number;
          platform_fee?: number;
          vendor_payout?: number;
          status?: string;
          platform_fee_recognized_at?: string | null;
          vendor_earned_at?: string | null;
          refunded_at?: string | null;
          refund_amount_cents?: number;
          transferred_at?: string | null;
          stripe_refund_id?: string | null;
          stripe_transfer_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'transactions_booking_request_id_fkey';
            columns: ['booking_request_id'];
            isOneToOne: false;
            referencedRelation: 'booking_requests';
            referencedColumns: ['id'];
          },
        ];
      };
      reviews: {
        Row: {
          id: string;
          booking_request_id: string;
          reviewer_user_id: string;
          vendor_profile_id: string;
          rating_overall: number;
          rating_quality: number | null;
          rating_communication: number | null;
          rating_professionalism: number | null;
          rating_value: number | null;
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_request_id: string;
          reviewer_user_id: string;
          vendor_profile_id: string;
          rating_overall: number;
          rating_quality?: number | null;
          rating_communication?: number | null;
          rating_professionalism?: number | null;
          rating_value?: number | null;
          comment?: string | null;
          created_at?: string;
        };
        Update: {
          rating_overall?: number;
          rating_quality?: number | null;
          rating_communication?: number | null;
          rating_professionalism?: number | null;
          rating_value?: number | null;
          comment?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'reviews_booking_request_id_fkey';
            columns: ['booking_request_id'];
            isOneToOne: true;
            referencedRelation: 'booking_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reviews_reviewer_user_id_fkey';
            columns: ['reviewer_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reviews_vendor_profile_id_fkey';
            columns: ['vendor_profile_id'];
            isOneToOne: false;
            referencedRelation: 'vendor_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      cron_runs: {
        Row: {
          id: string;
          job: string;
          started_at: string;
          completed_at: string | null;
          duration_ms: number | null;
          result: unknown | null;
          error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          job: string;
          started_at?: string;
          completed_at?: string | null;
          duration_ms?: number | null;
          result?: unknown | null;
          error?: string | null;
          created_at?: string;
        };
        Update: {
          job?: string;
          started_at?: string;
          completed_at?: string | null;
          duration_ms?: number | null;
          result?: unknown | null;
          error?: string | null;
        };
        Relationships: [];
      };
      stripe_events: {
        Row: {
          event_id: string;
          event_type: string;
          received_at: string;
          handled_at: string | null;
          error: string | null;
          payload: unknown | null;
        };
        Insert: {
          event_id: string;
          event_type: string;
          received_at?: string;
          handled_at?: string | null;
          error?: string | null;
          payload?: unknown | null;
        };
        Update: {
          event_type?: string;
          handled_at?: string | null;
          error?: string | null;
          payload?: unknown | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      search_vendors_semantic: {
        Args: { query_embedding: string; match_count: number; similarity_threshold: number };
        Returns: (Database['public']['Tables']['vendor_profiles']['Row'] & {
          similarity: number;
        })[];
      };
      search_vendors_fulltext: {
        Args: { search_query: string; match_count: number };
        Returns: (Database['public']['Tables']['vendor_profiles']['Row'] & { rank: number })[];
      };
      expire_stale_booking_requests: {
        Args: Record<string, never>;
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
