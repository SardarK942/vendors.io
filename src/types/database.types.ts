/**
 * Manual database types matching the Supabase schema.
 *
 * Migrations up to and including 00030 are reflected here:
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
 *   - 00030 notifications table + RLS + realtime publication (Sub-project F)
 *   - 00031 ai_bio_assist_calls (Sub-project B)
 *   - 00032 vendor_calendar_holds (Sub-project G)
 *   - 00033 vendor_profiles.payment_mode (dropped in 00058, Bucket F)
 *   - 00034 booking_events.vendor_notes + booking_events_public view + vendor_profile_views
 *           + payouts + payout_bookings (Sub-project E)
 *   - 00035 users.active_vendor_profile_id nullable FK (Sub-project I)
 *   - 00043 users.onboarding_completed_at + users.onboarding_data (onboarding welcome)
 *   - 00044 vendor_profiles.is_active + onboarding_complete (PR #29 schema drift)
 *   - 00045 added 'content_creation' to vendor_profiles_category_check (Sub-project K)
 *   - 00046 scraped_vendors staging table (Sub-project K)
 *   - 00047 claim_tokens table (Sub-project K)
 *   - 00048 pg_trgm extension + trigram indexes (Sub-project K)
 *   - 00049 match_scraped_vendors_by_name RPC (Sub-project K)
 *   - 00050 select_scraped_vendors_for_mint RPC (Sub-project K)
 *   - 00051 scraped_vendors.slug NOT NULL UNIQUE (Sub-project K-2)
 *   - 00052 public_scraped_vendors_{list, by_slug} RPCs (Sub-project K-2)
 *   - 00053 scraped_vendor_engagement + scraped_vendor_requests (Sub-project K-2)
 *   - 00054 match_scraped_vendors_by_name returns slug (Sub-project K-2)
 *   - 00055 scraped_vendors.tiktok_handle nullable (Sub-project K — cultural re-scrape 2026-06-04)
 *
 * Replace with auto-generated types once we decide to switch:
 *   npx supabase gen types typescript --project-id <ref> > src/types/database.types.ts
 */

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
  | 'review_received'
  | 'custom_request_received'
  | 'couple_countered';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

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
  | 'adjusted_quote_declined'
  | 'pending_quote'
  | 'couple_countered';

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
      ai_bio_assist_calls: {
        Row: {
          user_id: string;
          calls_in_window: number;
          window_started_at: string;
        };
        Insert: {
          user_id: string;
          calls_in_window?: number;
          window_started_at?: string;
        };
        Update: {
          user_id?: string;
          calls_in_window?: number;
          window_started_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_bio_assist_calls_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          phone: string | null;
          role: 'couple' | 'vendor' | 'admin';
          created_at: string;
          updated_at: string;
          active_vendor_profile_id: string | null;
          profile_backfill_dismissed_at: string | null;
          onboarding_completed_at: string | null;
          onboarding_data: Record<string, unknown> | null;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          phone?: string | null;
          role: 'couple' | 'vendor' | 'admin';
          created_at?: string;
          updated_at?: string;
          active_vendor_profile_id?: string | null;
          profile_backfill_dismissed_at?: string | null;
          onboarding_completed_at?: string | null;
          onboarding_data?: Record<string, unknown> | null;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          phone?: string | null;
          role?: 'couple' | 'vendor' | 'admin';
          updated_at?: string;
          active_vendor_profile_id?: string | null;
          profile_backfill_dismissed_at?: string | null;
          onboarding_completed_at?: string | null;
          onboarding_data?: Record<string, unknown> | null;
        };
        Relationships: [
          {
            foreignKeyName: 'users_active_vendor_profile_id_fkey';
            columns: ['active_vendor_profile_id'];
            isOneToOne: false;
            referencedRelation: 'vendor_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      vendor_profiles: {
        Row: {
          id: string;
          user_id: string;
          business_name: string;
          slug: string | null;
          category:
            | 'photography'
            | 'videography'
            | 'mehndi'
            | 'hair_makeup'
            | 'dj'
            | 'photobooth'
            | 'catering'
            | 'venue'
            | 'decor'
            | 'invitations'
            | 'bridal_wear'
            | 'live_music'
            | 'carts'
            | 'content_creation';
          bio: string | null;
          service_area: string[];
          portfolio_images: string[];
          instagram_handle: string | null;
          website_url: string | null;
          verified: boolean;
          languages: string[] | null;
          years_in_business: number | null;
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
          base_address_skipped: boolean;
          is_active: boolean;
          onboarding_complete: boolean;
          concurrent_capacity: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          business_name: string;
          slug?: string | null;
          category:
            | 'photography'
            | 'videography'
            | 'mehndi'
            | 'hair_makeup'
            | 'dj'
            | 'photobooth'
            | 'catering'
            | 'venue'
            | 'decor'
            | 'invitations'
            | 'bridal_wear'
            | 'live_music'
            | 'carts'
            | 'content_creation';
          bio?: string | null;
          service_area?: string[];
          portfolio_images?: string[];
          instagram_handle?: string | null;
          website_url?: string | null;
          verified?: boolean;
          languages?: string[] | null;
          years_in_business?: number | null;
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
          base_address_skipped?: boolean;
          is_active?: boolean;
          onboarding_complete?: boolean;
          concurrent_capacity?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          business_name?: string;
          slug?: string | null;
          category?:
            | 'photography'
            | 'videography'
            | 'mehndi'
            | 'hair_makeup'
            | 'dj'
            | 'photobooth'
            | 'catering'
            | 'venue'
            | 'decor'
            | 'invitations'
            | 'bridal_wear'
            | 'live_music'
            | 'carts'
            | 'content_creation';
          bio?: string | null;
          service_area?: string[];
          portfolio_images?: string[];
          instagram_handle?: string | null;
          website_url?: string | null;
          verified?: boolean;
          languages?: string[] | null;
          years_in_business?: number | null;
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
          base_address_skipped?: boolean;
          is_active?: boolean;
          onboarding_complete?: boolean;
          concurrent_capacity?: number;
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
          vendor_notes: string | null;
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
          vendor_notes?: string | null;
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
          vendor_notes?: string | null;
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
          event_type: string | null;
          vendor_adjustment_count: number;
          couple_counter_count: number;
          couple_counter_amount: number | null;
          couple_counter_note: string | null;
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
          event_type?: string | null;
          negotiation_round_count?: number;
          vendor_adjustment_count?: number;
          couple_counter_count?: number;
          couple_counter_amount?: number | null;
          couple_counter_note?: string | null;
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
          event_type?: string | null;
          negotiation_round_count?: number;
          vendor_adjustment_count?: number;
          couple_counter_count?: number;
          couple_counter_amount?: number | null;
          couple_counter_note?: string | null;
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
      newsletter_signups: {
        Row: {
          id: string;
          email: string;
          source: string;
          user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          source?: string;
          user_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          source?: string;
          user_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'newsletter_signups_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
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
          email_status: 'pending' | 'sent' | 'failed' | 'skipped';
          email_error: string | null;
          email_attempted_at: string | null;
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
          email_status?: 'pending' | 'sent' | 'failed' | 'skipped';
          email_error?: string | null;
          email_attempted_at?: string | null;
        };
        Update: {
          read_at?: string | null;
          email_status?: 'pending' | 'sent' | 'failed' | 'skipped';
          email_error?: string | null;
          email_attempted_at?: string | null;
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
      vendor_calendar_holds: {
        Row: {
          id: string;
          vendor_profile_id: string;
          booking_event_id: string | null;
          hold_type: 'booking' | 'vendor_blocked';
          hold_range: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          vendor_profile_id: string;
          booking_event_id?: string | null;
          hold_type: 'booking' | 'vendor_blocked';
          hold_range: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          vendor_profile_id?: string;
          booking_event_id?: string | null;
          hold_type?: 'booking' | 'vendor_blocked';
          hold_range?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vendor_calendar_holds_vendor_profile_id_fkey';
            columns: ['vendor_profile_id'];
            isOneToOne: false;
            referencedRelation: 'vendor_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_calendar_holds_booking_event_id_fkey';
            columns: ['booking_event_id'];
            isOneToOne: false;
            referencedRelation: 'booking_events';
            referencedColumns: ['id'];
          },
        ];
      };
      vendor_profile_views: {
        Row: {
          id: string;
          vendor_profile_id: string;
          viewer_user_id: string | null;
          ip_hash: string;
          user_agent: string | null;
          viewed_at: string;
        };
        Insert: {
          id?: string;
          vendor_profile_id: string;
          viewer_user_id?: string | null;
          ip_hash: string;
          user_agent?: string | null;
          viewed_at?: string;
        };
        Update: {
          vendor_profile_id?: string;
          viewer_user_id?: string | null;
          ip_hash?: string;
          user_agent?: string | null;
          viewed_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vendor_profile_views_vendor_profile_id_fkey';
            columns: ['vendor_profile_id'];
            isOneToOne: false;
            referencedRelation: 'vendor_profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vendor_profile_views_viewer_user_id_fkey';
            columns: ['viewer_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      payouts: {
        Row: {
          id: string;
          vendor_profile_id: string;
          stripe_payout_id: string;
          amount_cents: number;
          currency: string;
          status: 'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled';
          arrival_date: string | null;
          failure_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          vendor_profile_id: string;
          stripe_payout_id: string;
          amount_cents: number;
          currency?: string;
          status: 'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled';
          arrival_date?: string | null;
          failure_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          stripe_payout_id?: string;
          amount_cents?: number;
          currency?: string;
          status?: 'pending' | 'in_transit' | 'paid' | 'failed' | 'canceled';
          arrival_date?: string | null;
          failure_message?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payouts_vendor_profile_id_fkey';
            columns: ['vendor_profile_id'];
            isOneToOne: false;
            referencedRelation: 'vendor_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      payout_bookings: {
        Row: {
          payout_id: string;
          booking_id: string;
        };
        Insert: {
          payout_id: string;
          booking_id: string;
        };
        Update: {
          payout_id?: string;
          booking_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payout_bookings_payout_id_fkey';
            columns: ['payout_id'];
            isOneToOne: false;
            referencedRelation: 'payouts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payout_bookings_booking_id_fkey';
            columns: ['booking_id'];
            isOneToOne: false;
            referencedRelation: 'bookings';
            referencedColumns: ['id'];
          },
        ];
      };
      scraped_vendors: {
        Row: {
          id: string;
          slug: string;
          source:
            | 'google_maps'
            | 'instagram'
            | 'il_desi_arab_catering'
            | 'hand_curated'
            | 'searchgraph'
            | 'tiktok';
          source_external_id: string | null;
          business_name: string;
          category: string | null;
          tags: string[];
          city: string | null;
          state: string;
          postal_code: string | null;
          lat: number | null;
          lng: number | null;
          phone: string | null;
          email: string | null;
          website: string | null;
          instagram_handle: string | null;
          tiktok_handle: string | null;
          facebook_url: string | null;
          bio: string | null;
          photos: string[];
          raw: Record<string, unknown>;
          enriched: Record<string, unknown> | null;
          scraped_at: string;
          last_seen_at: string;
          claimed_at: string | null;
          claimed_vendor_profile_id: string | null;
          disputed_at: string | null;
          review_status: 'pending' | 'approved' | 'rejected' | 'duplicate';
        };
        Insert: {
          id?: string;
          slug?: string;
          source:
            | 'google_maps'
            | 'instagram'
            | 'il_desi_arab_catering'
            | 'hand_curated'
            | 'searchgraph'
            | 'tiktok';
          source_external_id?: string | null;
          business_name: string;
          category?: string | null;
          tags?: string[];
          city?: string | null;
          state?: string;
          postal_code?: string | null;
          lat?: number | null;
          lng?: number | null;
          phone?: string | null;
          email?: string | null;
          website?: string | null;
          instagram_handle?: string | null;
          tiktok_handle?: string | null;
          facebook_url?: string | null;
          bio?: string | null;
          photos?: string[];
          raw: Record<string, unknown>;
          enriched?: Record<string, unknown> | null;
          scraped_at?: string;
          last_seen_at?: string;
          claimed_at?: string | null;
          claimed_vendor_profile_id?: string | null;
          disputed_at?: string | null;
          review_status?: 'pending' | 'approved' | 'rejected' | 'duplicate';
        };
        Update: {
          slug?: string;
          category?: string | null;
          tags?: string[];
          city?: string | null;
          phone?: string | null;
          email?: string | null;
          website?: string | null;
          instagram_handle?: string | null;
          tiktok_handle?: string | null;
          bio?: string | null;
          photos?: string[];
          enriched?: Record<string, unknown> | null;
          last_seen_at?: string;
          claimed_at?: string | null;
          claimed_vendor_profile_id?: string | null;
          disputed_at?: string | null;
          review_status?: 'pending' | 'approved' | 'rejected' | 'duplicate';
        };
        Relationships: [
          {
            foreignKeyName: 'scraped_vendors_claimed_vendor_profile_id_fkey';
            columns: ['claimed_vendor_profile_id'];
            isOneToOne: false;
            referencedRelation: 'vendor_profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      scraped_vendor_engagement: {
        Row: {
          id: string;
          scraped_vendor_id: string;
          event_type: 'view' | 'ig_click';
          ip_hash: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          scraped_vendor_id: string;
          event_type: 'view' | 'ig_click';
          ip_hash: string;
          created_at?: string;
        };
        Update: {
          event_type?: 'view' | 'ig_click';
        };
        Relationships: [
          {
            foreignKeyName: 'scraped_vendor_engagement_scraped_vendor_id_fkey';
            columns: ['scraped_vendor_id'];
            isOneToOne: false;
            referencedRelation: 'scraped_vendors';
            referencedColumns: ['id'];
          },
        ];
      };
      scraped_vendor_requests: {
        Row: {
          id: string;
          scraped_vendor_id: string;
          action: 'remove' | 'claim_request';
          requester_name: string | null;
          requester_email: string;
          requester_ig: string | null;
          reason: string | null;
          status: 'open' | 'actioned' | 'rejected';
          created_at: string;
          actioned_at: string | null;
          actioned_by_user_id: string | null;
        };
        Insert: {
          id?: string;
          scraped_vendor_id: string;
          action: 'remove' | 'claim_request';
          requester_name?: string | null;
          requester_email: string;
          requester_ig?: string | null;
          reason?: string | null;
          status?: 'open' | 'actioned' | 'rejected';
          created_at?: string;
          actioned_at?: string | null;
          actioned_by_user_id?: string | null;
        };
        Update: {
          status?: 'open' | 'actioned' | 'rejected';
          actioned_at?: string | null;
          actioned_by_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'scraped_vendor_requests_scraped_vendor_id_fkey';
            columns: ['scraped_vendor_id'];
            isOneToOne: false;
            referencedRelation: 'scraped_vendors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'scraped_vendor_requests_actioned_by_user_id_fkey';
            columns: ['actioned_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      claim_tokens: {
        Row: {
          id: string;
          scraped_vendor_id: string;
          token_hash: string;
          issued_at: string;
          expires_at: string;
          claimed_at: string | null;
          claimed_by_user_id: string | null;
          revoked_at: string | null;
          campaign_label: string | null;
        };
        Insert: {
          id?: string;
          scraped_vendor_id: string;
          token_hash: string;
          issued_at?: string;
          expires_at: string;
          claimed_at?: string | null;
          claimed_by_user_id?: string | null;
          revoked_at?: string | null;
          campaign_label?: string | null;
        };
        Update: {
          claimed_at?: string | null;
          claimed_by_user_id?: string | null;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'claim_tokens_scraped_vendor_id_fkey';
            columns: ['scraped_vendor_id'];
            isOneToOne: false;
            referencedRelation: 'scraped_vendors';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'claim_tokens_claimed_by_user_id_fkey';
            columns: ['claimed_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      booking_events_public: {
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
      vendor_list_enrichments: {
        Args: { p_search_date?: string | null };
        Returns: {
          vendor_profile_id: string;
          confirmed_wedding_count: number;
          is_available_for_date: boolean | null;
        }[];
      };
      match_scraped_vendors_by_name: {
        Args: {
          p_name: string;
          p_city: string;
          p_min_similarity?: number;
          p_limit?: number;
        };
        Returns: {
          id: string;
          slug: string;
          business_name: string;
          category: string | null;
          city: string | null;
          instagram_handle: string | null;
          photos: string[];
          bio: string | null;
          similarity_score: number;
        }[];
      };
      select_scraped_vendors_for_mint: {
        Args: { p_where: string };
        Returns: {
          id: string;
          business_name: string;
          instagram_handle: string | null;
        }[];
      };
      public_scraped_vendors_by_slug: {
        Args: { p_slug: string };
        Returns: {
          id: string;
          slug: string;
          business_name: string;
          category: string | null;
          city: string | null;
          state: string;
          tags: string[];
          instagram_handle: string | null;
          website: string | null;
          bio: string | null;
          photos: string[];
        }[];
      };
      public_scraped_vendors_list: {
        Args: {
          p_category?: string | null;
          p_city?: string | null;
          p_limit?: number;
        };
        Returns: {
          id: string;
          slug: string;
          business_name: string;
          category: string | null;
          city: string | null;
          state: string;
          instagram_handle: string | null;
          bio: string | null;
          photos: string[];
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
