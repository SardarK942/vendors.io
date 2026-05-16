/**
 * Manual database types matching the Supabase schema.
 *
 * Migrations up to and including 00027 are reflected here:
 *   - 00015 packages, 00016 package_addons, 00016 booking_events
 *   - 00017 booking_requests → bookings rename (FK names retained)
 *   - 00018 new bookings columns (package_id, snapshots, adjustment fields,
 *     total_price_cents, negotiation_round_count) + expanded status check
 *   - 00019 vendor_profiles.base_address_* columns + visibility toggle
 *   - 00020 vendor_packages_price_band view + total_price trigger
 *   - 00027 booking_events.completed_at (per-event completion tracking)
 *   - A-cleanup: dropped legacy columns (event_date, event_type, budget_min/max,
 *     vendor_quote_amount/notes/responded_at from bookings;
 *     starting_price_min/max from vendor_profiles); 'quoted'/'rejected' statuses removed
 *
 * Replace with auto-generated types once we decide to switch:
 *   npx supabase gen types typescript --project-id <ref> > src/types/database.types.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type NotificationType =
  | 'booking_request_received'
  | 'vendor_accepted'
  | 'vendor_adjusted_quote'
  | 'couple_accepted_adjusted'
  | 'couple_declined_adjusted'
  | 'deposit_paid'
  | 'booking_confirmed'
  | 'booking_auto_cancelled'
  | 'booking_cancelled'
  | 'event_completed'
  | 'booking_completed'
  | 'review_received';

export type BookingStatus =
  | 'pending'
  | 'deposit_paid'
  | 'couple_cancelled'
  | 'vendor_cancelled'
  | 'cancelled_mutual'
  | 'completed'
  | 'expired'
  | 'disputed'
  | 'accepted'
  | 'adjusted_quote_sent'
  | 'adjusted_quote_declined';

export type AdjustmentReason =
  | 'travel'
  | 'guest_count'
  | 'peak_date'
  | 'custom'
  | 'setup_complexity'
  | 'discount'
  | 'other';

export type PackageLocationMode = 'couple_provides' | 'at_vendor';

export interface SelectedAddonSnapshot {
  addon_id: string;
  name: string;
  price_delta_cents: number;
}

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
          portfolio_images: string[];
          instagram_handle: string | null;
          website_url: string | null;
          verified: boolean;
          response_sla_hours: number;
          total_bookings: number;
          average_rating: number | null;
          review_count: number;
          searchable_text: string | null;
          base_address_line_1: string | null;
          base_city: string | null;
          base_state: string | null;
          base_postal_code: string | null;
          base_google_place_id: string | null;
          base_address_public: boolean;
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
          portfolio_images?: string[];
          instagram_handle?: string | null;
          website_url?: string | null;
          verified?: boolean;
          response_sla_hours?: number;
          total_bookings?: number;
          average_rating?: number | null;
          review_count?: number;
          base_address_line_1?: string | null;
          base_city?: string | null;
          base_state?: string | null;
          base_postal_code?: string | null;
          base_google_place_id?: string | null;
          base_address_public?: boolean;
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
          portfolio_images?: string[];
          instagram_handle?: string | null;
          website_url?: string | null;
          verified?: boolean;
          response_sla_hours?: number;
          total_bookings?: number;
          average_rating?: number | null;
          review_count?: number;
          base_address_line_1?: string | null;
          base_city?: string | null;
          base_state?: string | null;
          base_postal_code?: string | null;
          base_google_place_id?: string | null;
          base_address_public?: boolean;
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
      packages: {
        Row: {
          id: string;
          vendor_profile_id: string;
          name: string;
          description: string;
          base_price_cents: number;
          included_items: string[];
          max_guests: number;
          duration_hours: number;
          events_count: number;
          featured_image_url: string;
          gallery_image_urls: string[];
          vendor_notes_template: string | null;
          location_mode: PackageLocationMode;
          display_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vendor_profile_id: string;
          name: string;
          description: string;
          base_price_cents: number;
          included_items?: string[];
          max_guests: number;
          duration_hours: number;
          events_count?: number;
          featured_image_url: string;
          gallery_image_urls?: string[];
          vendor_notes_template?: string | null;
          location_mode?: PackageLocationMode;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          vendor_profile_id?: string;
          name?: string;
          description?: string;
          base_price_cents?: number;
          included_items?: string[];
          max_guests?: number;
          duration_hours?: number;
          events_count?: number;
          featured_image_url?: string;
          gallery_image_urls?: string[];
          vendor_notes_template?: string | null;
          location_mode?: PackageLocationMode;
          display_order?: number;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'packages_vendor_profile_id_fkey';
            columns: ['vendor_profile_id'];
            isOneToOne: false;
            referencedRelation: 'vendor_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      package_addons: {
        Row: {
          id: string;
          package_id: string;
          name: string;
          price_delta_cents: number;
          display_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          package_id: string;
          name: string;
          price_delta_cents: number;
          display_order?: number;
          created_at?: string;
        };
        Update: {
          name?: string;
          price_delta_cents?: number;
          display_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'package_addons_package_id_fkey';
            columns: ['package_id'];
            isOneToOne: false;
            referencedRelation: 'packages';
            referencedColumns: ['id'];
          },
        ];
      };
      booking_events: {
        Row: {
          id: string;
          booking_id: string;
          sequence: number;
          event_date: string;
          event_start_time: string;
          event_end_time: string;
          event_type_label: string;
          location_name: string | null;
          address_line_1: string;
          city: string;
          state: string;
          postal_code: string;
          google_place_id: string | null;
          guest_count_override: number | null;
          location_overridden: boolean;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          sequence: number;
          event_date: string;
          event_start_time: string;
          event_end_time: string;
          event_type_label: string;
          location_name?: string | null;
          address_line_1: string;
          city: string;
          state: string;
          postal_code: string;
          google_place_id?: string | null;
          guest_count_override?: number | null;
          location_overridden?: boolean;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: {
          sequence?: number;
          event_date?: string;
          event_start_time?: string;
          event_end_time?: string;
          event_type_label?: string;
          location_name?: string | null;
          address_line_1?: string;
          city?: string;
          state?: string;
          postal_code?: string;
          google_place_id?: string | null;
          guest_count_override?: number | null;
          location_overridden?: boolean;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'booking_events_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
        ];
      };
      bookings: {
        Row: {
          id: string;
          couple_user_id: string;
          vendor_profile_id: string;
          guest_count: number | null;
          special_requests: string | null;
          status: BookingStatus;
          deposit_amount: number | null;
          deposit_paid_at: string | null;
          stripe_payment_intent_id: string | null;
          couple_contact_revealed: boolean;
          couple_phone: string | null;
          couple_email: string | null;
          couple_full_name: string | null;
          couple_contact_phone: string | null;
          expires_at: string | null;
          completed_at: string | null;
          cancelled_at: string | null;
          cancellation_reason: string | null;
          cancellation_fault: 'none' | 'vendor_fault' | 'force_majeure' | null;
          disputed_at: string | null;
          dispute_reason: string | null;
          package_id: string | null;
          package_name_snapshot: string | null;
          package_base_price_cents_snapshot: number | null;
          selected_addons: SelectedAddonSnapshot[];
          adjustment_amount_cents: number;
          adjustment_reason: AdjustmentReason | null;
          adjustment_explanation: string | null;
          vendor_notes: string | null;
          total_price_cents: number;
          negotiation_round_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          couple_user_id: string;
          vendor_profile_id: string;
          guest_count?: number | null;
          special_requests?: string | null;
          status?: BookingStatus;
          deposit_amount?: number | null;
          deposit_paid_at?: string | null;
          stripe_payment_intent_id?: string | null;
          couple_contact_revealed?: boolean;
          couple_phone?: string | null;
          couple_email?: string | null;
          couple_full_name?: string | null;
          couple_contact_phone?: string | null;
          expires_at?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          cancellation_fault?: 'none' | 'vendor_fault' | 'force_majeure' | null;
          disputed_at?: string | null;
          dispute_reason?: string | null;
          package_id?: string | null;
          package_name_snapshot?: string | null;
          package_base_price_cents_snapshot?: number | null;
          selected_addons?: SelectedAddonSnapshot[];
          adjustment_amount_cents?: number;
          adjustment_reason?: AdjustmentReason | null;
          adjustment_explanation?: string | null;
          vendor_notes?: string | null;
          total_price_cents?: number;
          negotiation_round_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          couple_user_id?: string;
          vendor_profile_id?: string;
          guest_count?: number | null;
          special_requests?: string | null;
          status?: BookingStatus;
          deposit_amount?: number | null;
          deposit_paid_at?: string | null;
          stripe_payment_intent_id?: string | null;
          couple_contact_revealed?: boolean;
          couple_phone?: string | null;
          couple_email?: string | null;
          couple_full_name?: string | null;
          couple_contact_phone?: string | null;
          expires_at?: string | null;
          completed_at?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          cancellation_fault?: 'none' | 'vendor_fault' | 'force_majeure' | null;
          disputed_at?: string | null;
          dispute_reason?: string | null;
          package_id?: string | null;
          package_name_snapshot?: string | null;
          package_base_price_cents_snapshot?: number | null;
          selected_addons?: SelectedAddonSnapshot[];
          adjustment_amount_cents?: number;
          adjustment_reason?: AdjustmentReason | null;
          adjustment_explanation?: string | null;
          vendor_notes?: string | null;
          total_price_cents?: number;
          negotiation_round_count?: number;
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
          {
            foreignKeyName: 'bookings_package_id_fkey';
            columns: ['package_id'];
            isOneToOne: false;
            referencedRelation: 'packages';
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
            referencedRelation: 'bookings';
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
            referencedRelation: 'bookings';
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
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: NotificationType;
          title: string;
          body: string;
          link: string | null;
          metadata: Record<string, unknown>;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: NotificationType;
          title: string;
          body: string;
          link?: string | null;
          metadata?: Record<string, unknown>;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          read_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      vendor_packages_price_band: {
        Row: {
          vendor_profile_id: string | null;
          min_price_cents: number | null;
          max_price_cents: number | null;
          active_package_count: number | null;
        };
        Relationships: [];
      };
    };
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
      redact_stale_booking_pii: {
        Args: { retention_days?: number };
        Returns: number;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
