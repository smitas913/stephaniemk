export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      booking_leads: {
        Row: {
          address_line_1: string | null
          allow_non_working_day: boolean
          city: string | null
          contact_card_photo_url: string | null
          converted_consultant_id: string | null
          converted_customer_id: string | null
          created_at: string
          email: string | null
          id: string
          last_contact_date: string | null
          lead_activity: string | null
          lead_source: string | null
          met_date: string | null
          name: string
          next_follow_up_date: string | null
          notes: string | null
          owner_user_id: string | null
          phone: string | null
          postal_code: string | null
          source_detail: string | null
          state_territory: string | null
          status: Database["public"]["Enums"]["booking_lead_status"]
          updated_at: string | null
        }
        Insert: {
          address_line_1?: string | null
          allow_non_working_day?: boolean
          city?: string | null
          contact_card_photo_url?: string | null
          converted_consultant_id?: string | null
          converted_customer_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_contact_date?: string | null
          lead_activity?: string | null
          lead_source?: string | null
          met_date?: string | null
          name: string
          next_follow_up_date?: string | null
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          postal_code?: string | null
          source_detail?: string | null
          state_territory?: string | null
          status?: Database["public"]["Enums"]["booking_lead_status"]
          updated_at?: string | null
        }
        Update: {
          address_line_1?: string | null
          allow_non_working_day?: boolean
          city?: string | null
          contact_card_photo_url?: string | null
          converted_consultant_id?: string | null
          converted_customer_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_contact_date?: string | null
          lead_activity?: string | null
          lead_source?: string | null
          met_date?: string | null
          name?: string
          next_follow_up_date?: string | null
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          postal_code?: string | null
          source_detail?: string | null
          state_territory?: string | null
          status?: Database["public"]["Enums"]["booking_lead_status"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_leads_converted_consultant_id_fkey"
            columns: ["converted_consultant_id"]
            isOneToOne: false
            referencedRelation: "team_consultants"
            referencedColumns: ["id"]
          },
        ]
      }
      business_goals: {
        Row: {
          auto_track_key: string | null
          created_at: string
          goal_value: number
          id: string
          is_visible: boolean
          manual_actual: number | null
          metric_key: string
          metric_label: string
          period: string
          sort_order: number
          unit: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_track_key?: string | null
          created_at?: string
          goal_value?: number
          id?: string
          is_visible?: boolean
          manual_actual?: number | null
          metric_key: string
          metric_label: string
          period: string
          sort_order?: number
          unit?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_track_key?: string | null
          created_at?: string
          goal_value?: number
          id?: string
          is_visible?: boolean
          manual_actual?: number | null
          metric_key?: string
          metric_label?: string
          period?: string
          sort_order?: number
          unit?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      catalog_campaign_customers: {
        Row: {
          campaign_id: string
          consultant_id: string | null
          created_at: string
          customer_id: string | null
          follow_up_completed: boolean
          follow_up_date: string | null
          id: string
        }
        Insert: {
          campaign_id: string
          consultant_id?: string | null
          created_at?: string
          customer_id?: string | null
          follow_up_completed?: boolean
          follow_up_date?: string | null
          id?: string
        }
        Update: {
          campaign_id?: string
          consultant_id?: string | null
          created_at?: string
          customer_id?: string | null
          follow_up_completed?: boolean
          follow_up_date?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "catalog_campaign_customers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "catalog_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_campaign_customers_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "team_consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_campaign_customers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_campaign_customers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_campaigns: {
        Row: {
          campaign_type: string
          created_at: string
          id: string
          mailing_date: string
          notes: string | null
          owner_user_id: string | null
          updated_at: string | null
        }
        Insert: {
          campaign_type: string
          created_at?: string
          id?: string
          mailing_date: string
          notes?: string | null
          owner_user_id?: string | null
          updated_at?: string | null
        }
        Update: {
          campaign_type?: string
          created_at?: string
          id?: string
          mailing_date?: string
          notes?: string | null
          owner_user_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      completed_birthdays: {
        Row: {
          birthday_year: number
          completed_at: string
          event_type: string
          id: string
          person_id: string
          person_type: string
          user_id: string
        }
        Insert: {
          birthday_year: number
          completed_at?: string
          event_type?: string
          id?: string
          person_id: string
          person_type?: string
          user_id: string
        }
        Update: {
          birthday_year?: number
          completed_at?: string
          event_type?: string
          id?: string
          person_id?: string
          person_type?: string
          user_id?: string
        }
        Relationships: []
      }
      content_feedback: {
        Row: {
          created_at: string | null
          id: number
          rating: string | null
          section: string | null
          topic: string | null
          url: string | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          rating?: string | null
          section?: string | null
          topic?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string | null
          id?: number
          rating?: string | null
          section?: string | null
          topic?: string | null
          url?: string | null
        }
        Relationships: []
      }
      custom_blackout_days: {
        Row: {
          blackout_date: string
          created_at: string
          id: string
          label: string | null
          user_id: string
        }
        Insert: {
          blackout_date: string
          created_at?: string
          id?: string
          label?: string | null
          user_id: string
        }
        Update: {
          blackout_date?: string
          created_at?: string
          id?: string
          label?: string | null
          user_id?: string
        }
        Relationships: []
      }
      customer_notes: {
        Row: {
          consultant_id: string | null
          created_at: string
          customer_id: string | null
          id: string
          note_date: string
          note_text: string
          note_type: string
          owner_user_id: string | null
        }
        Insert: {
          consultant_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          note_date?: string
          note_text: string
          note_type?: string
          owner_user_id?: string | null
        }
        Update: {
          consultant_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          note_date?: string
          note_text?: string
          note_type?: string
          owner_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_notes_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "team_consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          allow_non_working_day: boolean
          archived_at: string | null
          assigned_consultant_id: string | null
          attention_reason: string | null
          beauty_notes: Json
          became_customer_date: string | null
          birthday: string | null
          birthday_mmdd: string | null
          city: string | null
          created_at: string
          customer_source: string | null
          date_added: string
          dormant_follow_up_stage: string | null
          email: string | null
          flagged_at: string | null
          follow_up_reason: string | null
          former_consultant_data: Json | null
          full_name: string
          id: string
          is_active: boolean
          is_skincare_customer: boolean
          last_contacted: string | null
          last_order_date_order_log: string | null
          last_order_mk: string | null
          needs_attention: boolean
          new_customer_flag: boolean
          new_follow_up_stage: string | null
          next_follow_up_date: string | null
          notes: string | null
          owner_user_id: string | null
          phone: string | null
          postal_code: string | null
          profile_date_first_order_date: string | null
          relationship_status: string | null
          scan_pdf_url: string | null
          skin_type: string | null
          skincare_started_at: string | null
          state_territory: string | null
          tags: string[]
          updated_at: string | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          allow_non_working_day?: boolean
          archived_at?: string | null
          assigned_consultant_id?: string | null
          attention_reason?: string | null
          beauty_notes?: Json
          became_customer_date?: string | null
          birthday?: string | null
          birthday_mmdd?: string | null
          city?: string | null
          created_at?: string
          customer_source?: string | null
          date_added?: string
          dormant_follow_up_stage?: string | null
          email?: string | null
          flagged_at?: string | null
          follow_up_reason?: string | null
          former_consultant_data?: Json | null
          full_name: string
          id?: string
          is_active?: boolean
          is_skincare_customer?: boolean
          last_contacted?: string | null
          last_order_date_order_log?: string | null
          last_order_mk?: string | null
          needs_attention?: boolean
          new_customer_flag?: boolean
          new_follow_up_stage?: string | null
          next_follow_up_date?: string | null
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          postal_code?: string | null
          profile_date_first_order_date?: string | null
          relationship_status?: string | null
          scan_pdf_url?: string | null
          skin_type?: string | null
          skincare_started_at?: string | null
          state_territory?: string | null
          tags?: string[]
          updated_at?: string | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          allow_non_working_day?: boolean
          archived_at?: string | null
          assigned_consultant_id?: string | null
          attention_reason?: string | null
          beauty_notes?: Json
          became_customer_date?: string | null
          birthday?: string | null
          birthday_mmdd?: string | null
          city?: string | null
          created_at?: string
          customer_source?: string | null
          date_added?: string
          dormant_follow_up_stage?: string | null
          email?: string | null
          flagged_at?: string | null
          follow_up_reason?: string | null
          former_consultant_data?: Json | null
          full_name?: string
          id?: string
          is_active?: boolean
          is_skincare_customer?: boolean
          last_contacted?: string | null
          last_order_date_order_log?: string | null
          last_order_mk?: string | null
          needs_attention?: boolean
          new_customer_flag?: boolean
          new_follow_up_stage?: string | null
          next_follow_up_date?: string | null
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          postal_code?: string | null
          profile_date_first_order_date?: string | null
          relationship_status?: string | null
          scan_pdf_url?: string | null
          skin_type?: string | null
          skincare_started_at?: string | null
          state_territory?: string | null
          tags?: string[]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_assigned_consultant_id_fkey"
            columns: ["assigned_consultant_id"]
            isOneToOne: false
            referencedRelation: "team_consultants"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_focus_progress: {
        Row: {
          auto_count: number
          created_at: string
          day_type: string
          focus_date: string
          id: string
          is_complete: boolean
          manual_adjustment: number
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_count?: number
          created_at?: string
          day_type?: string
          focus_date?: string
          id?: string
          is_complete?: boolean
          manual_adjustment?: number
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_count?: number
          created_at?: string
          day_type?: string
          focus_date?: string
          id?: string
          is_complete?: boolean
          manual_adjustment?: number
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_plan_items: {
        Row: {
          address: string | null
          allow_non_working_day: boolean
          canceled_at: string | null
          consultant_id: string | null
          created_at: string
          customer_id: string | null
          customer_name: string
          event_location: string | null
          event_time: string | null
          id: string
          is_canceled: boolean
          item_type: string
          notes: string | null
          owner_user_id: string | null
          phone: string | null
          plan_date: string
          sort_order: number
        }
        Insert: {
          address?: string | null
          allow_non_working_day?: boolean
          canceled_at?: string | null
          consultant_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          event_location?: string | null
          event_time?: string | null
          id?: string
          is_canceled?: boolean
          item_type: string
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          plan_date?: string
          sort_order?: number
        }
        Update: {
          address?: string | null
          allow_non_working_day?: boolean
          canceled_at?: string | null
          consultant_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          event_location?: string | null
          event_time?: string | null
          id?: string
          is_canceled?: boolean
          item_type?: string
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          plan_date?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_plan_items_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "team_consultants"
            referencedColumns: ["id"]
          },
        ]
      }
      day_type_targets: {
        Row: {
          created_at: string
          day_type: string
          id: string
          sort_order: number
          target: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_type?: string
          id?: string
          sort_order?: number
          target?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_type?: string
          id?: string
          sort_order?: number
          target?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      discount_types: {
        Row: {
          created_at: string
          id: string
          is_archived: boolean
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_archived?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_archived?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      event_guests: {
        Row: {
          attending: boolean | null
          booked: boolean | null
          consultant_id: string | null
          converted_consultant_id: string | null
          converted_customer_id: string | null
          converted_facial_contact_id: string | null
          created_at: string
          email: string | null
          event_id: string
          id: string
          interested: boolean | null
          name: string
          notes: string | null
          ordered: boolean | null
          owner_user_id: string | null
          party_rescheduled: boolean
          phone: string | null
          referral_count: number
          rsvp: string | null
          skin_type: string | null
          task_day_before_sent: boolean
          task_invite_sent: boolean
          thank_you_sent: boolean | null
          video_watched: boolean
        }
        Insert: {
          attending?: boolean | null
          booked?: boolean | null
          consultant_id?: string | null
          converted_consultant_id?: string | null
          converted_customer_id?: string | null
          converted_facial_contact_id?: string | null
          created_at?: string
          email?: string | null
          event_id: string
          id?: string
          interested?: boolean | null
          name: string
          notes?: string | null
          ordered?: boolean | null
          owner_user_id?: string | null
          party_rescheduled?: boolean
          phone?: string | null
          referral_count?: number
          rsvp?: string | null
          skin_type?: string | null
          task_day_before_sent?: boolean
          task_invite_sent?: boolean
          thank_you_sent?: boolean | null
          video_watched?: boolean
        }
        Update: {
          attending?: boolean | null
          booked?: boolean | null
          consultant_id?: string | null
          converted_consultant_id?: string | null
          converted_customer_id?: string | null
          converted_facial_contact_id?: string | null
          created_at?: string
          email?: string | null
          event_id?: string
          id?: string
          interested?: boolean | null
          name?: string
          notes?: string | null
          ordered?: boolean | null
          owner_user_id?: string | null
          party_rescheduled?: boolean
          phone?: string | null
          referral_count?: number
          rsvp?: string | null
          skin_type?: string | null
          task_day_before_sent?: boolean
          task_invite_sent?: boolean
          thank_you_sent?: boolean | null
          video_watched?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "event_guests_converted_consultant_id_fkey"
            columns: ["converted_consultant_id"]
            isOneToOne: false
            referencedRelation: "team_consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_guests_converted_facial_contact_id_fkey"
            columns: ["converted_facial_contact_id"]
            isOneToOne: false
            referencedRelation: "facial_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          allow_non_working_day: boolean
          booked_from: string | null
          checklist_day_before_sent: boolean | null
          checklist_google_form_completed: boolean | null
          checklist_guest_list_received: boolean | null
          checklist_invitations_sent: boolean | null
          checklist_reminders_sent: boolean | null
          checklist_samples_sent: boolean | null
          coaching_call_date: string | null
          coaching_notes: string | null
          coaching_status: string | null
          created_at: string
          event_date: string | null
          event_format: string
          event_id: string
          event_location: string | null
          event_scope: string
          event_status: string
          event_time: string | null
          event_type: string | null
          event_venue_type: string | null
          future_bookings_count: number | null
          google_form_link: string | null
          guest_count: number | null
          hostess_converted_consultant_id: string | null
          hostess_converted_customer_id: string | null
          hostess_email: string | null
          hostess_lead_id: string | null
          hostess_name: string | null
          hostess_next_action: string | null
          hostess_next_action_date: string | null
          hostess_phone: string | null
          hostess_skin_type: string | null
          hostess_source: string | null
          hostess_video_watched: boolean
          id: string
          is_archived: boolean | null
          notes: string | null
          ordering_guest_count: number | null
          owner_user_id: string | null
          rebook_not_interested: boolean | null
          requires_manual_next_step: boolean
          reschedule_attempt_number: number
          reschedule_last_contact_date: string | null
          reschedule_next_follow_up_date: string | null
          reschedule_status: string | null
          sharing_appointments_count: number | null
          thank_you_sent: boolean
          unit_guest_count: number | null
          updated_at: string | null
          virtual_notes: string | null
          virtual_platform: string | null
          virtual_platform_link: string | null
          zoom_id: string | null
          zoom_link: string | null
          zoom_password: string | null
        }
        Insert: {
          allow_non_working_day?: boolean
          booked_from?: string | null
          checklist_day_before_sent?: boolean | null
          checklist_google_form_completed?: boolean | null
          checklist_guest_list_received?: boolean | null
          checklist_invitations_sent?: boolean | null
          checklist_reminders_sent?: boolean | null
          checklist_samples_sent?: boolean | null
          coaching_call_date?: string | null
          coaching_notes?: string | null
          coaching_status?: string | null
          created_at?: string
          event_date?: string | null
          event_format?: string
          event_id: string
          event_location?: string | null
          event_scope?: string
          event_status?: string
          event_time?: string | null
          event_type?: string | null
          event_venue_type?: string | null
          future_bookings_count?: number | null
          google_form_link?: string | null
          guest_count?: number | null
          hostess_converted_consultant_id?: string | null
          hostess_converted_customer_id?: string | null
          hostess_email?: string | null
          hostess_lead_id?: string | null
          hostess_name?: string | null
          hostess_next_action?: string | null
          hostess_next_action_date?: string | null
          hostess_phone?: string | null
          hostess_skin_type?: string | null
          hostess_source?: string | null
          hostess_video_watched?: boolean
          id?: string
          is_archived?: boolean | null
          notes?: string | null
          ordering_guest_count?: number | null
          owner_user_id?: string | null
          rebook_not_interested?: boolean | null
          requires_manual_next_step?: boolean
          reschedule_attempt_number?: number
          reschedule_last_contact_date?: string | null
          reschedule_next_follow_up_date?: string | null
          reschedule_status?: string | null
          sharing_appointments_count?: number | null
          thank_you_sent?: boolean
          unit_guest_count?: number | null
          updated_at?: string | null
          virtual_notes?: string | null
          virtual_platform?: string | null
          virtual_platform_link?: string | null
          zoom_id?: string | null
          zoom_link?: string | null
          zoom_password?: string | null
        }
        Update: {
          allow_non_working_day?: boolean
          booked_from?: string | null
          checklist_day_before_sent?: boolean | null
          checklist_google_form_completed?: boolean | null
          checklist_guest_list_received?: boolean | null
          checklist_invitations_sent?: boolean | null
          checklist_reminders_sent?: boolean | null
          checklist_samples_sent?: boolean | null
          coaching_call_date?: string | null
          coaching_notes?: string | null
          coaching_status?: string | null
          created_at?: string
          event_date?: string | null
          event_format?: string
          event_id?: string
          event_location?: string | null
          event_scope?: string
          event_status?: string
          event_time?: string | null
          event_type?: string | null
          event_venue_type?: string | null
          future_bookings_count?: number | null
          google_form_link?: string | null
          guest_count?: number | null
          hostess_converted_consultant_id?: string | null
          hostess_converted_customer_id?: string | null
          hostess_email?: string | null
          hostess_lead_id?: string | null
          hostess_name?: string | null
          hostess_next_action?: string | null
          hostess_next_action_date?: string | null
          hostess_phone?: string | null
          hostess_skin_type?: string | null
          hostess_source?: string | null
          hostess_video_watched?: boolean
          id?: string
          is_archived?: boolean | null
          notes?: string | null
          ordering_guest_count?: number | null
          owner_user_id?: string | null
          rebook_not_interested?: boolean | null
          requires_manual_next_step?: boolean
          reschedule_attempt_number?: number
          reschedule_last_contact_date?: string | null
          reschedule_next_follow_up_date?: string | null
          reschedule_status?: string | null
          sharing_appointments_count?: number | null
          thank_you_sent?: boolean
          unit_guest_count?: number | null
          updated_at?: string | null
          virtual_notes?: string | null
          virtual_platform?: string | null
          virtual_platform_link?: string | null
          zoom_id?: string | null
          zoom_link?: string | null
          zoom_password?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_hostess_converted_consultant_id_fkey"
            columns: ["hostess_converted_consultant_id"]
            isOneToOne: false
            referencedRelation: "team_consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_hostess_converted_customer_id_fkey"
            columns: ["hostess_converted_customer_id"]
            isOneToOne: false
            referencedRelation: "customer_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_hostess_converted_customer_id_fkey"
            columns: ["hostess_converted_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_hostess_lead_id_fkey"
            columns: ["hostess_lead_id"]
            isOneToOne: false
            referencedRelation: "booking_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          event_type: string | null
          event_year: number | null
          expense_date: string
          id: string
          notes: string | null
          owner_user_id: string | null
          receipt_url: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          event_type?: string | null
          event_year?: number | null
          expense_date?: string
          id?: string
          notes?: string | null
          owner_user_id?: string | null
          receipt_url?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          event_type?: string | null
          event_year?: number | null
          expense_date?: string
          id?: string
          notes?: string | null
          owner_user_id?: string | null
          receipt_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      facial_contacts: {
        Row: {
          address_line_1: string | null
          address_line_2: string | null
          beauty_notes: Json
          birthday: string | null
          city: string | null
          converted_customer_id: string | null
          created_at: string
          email: string | null
          event_id: string | null
          facial_date: string | null
          foundation_shade: string | null
          full_name: string
          id: string
          notes: string | null
          owner_user_id: string
          phone: string | null
          postal_code: string | null
          raw_notes: string | null
          scan_pdf_url: string | null
          skin_type: string | null
          source_guest_id: string | null
          state_territory: string | null
          updated_at: string
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          beauty_notes?: Json
          birthday?: string | null
          city?: string | null
          converted_customer_id?: string | null
          created_at?: string
          email?: string | null
          event_id?: string | null
          facial_date?: string | null
          foundation_shade?: string | null
          full_name: string
          id?: string
          notes?: string | null
          owner_user_id?: string
          phone?: string | null
          postal_code?: string | null
          raw_notes?: string | null
          scan_pdf_url?: string | null
          skin_type?: string | null
          source_guest_id?: string | null
          state_territory?: string | null
          updated_at?: string
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          beauty_notes?: Json
          birthday?: string | null
          city?: string | null
          converted_customer_id?: string | null
          created_at?: string
          email?: string | null
          event_id?: string | null
          facial_date?: string | null
          foundation_shade?: string | null
          full_name?: string
          id?: string
          notes?: string | null
          owner_user_id?: string
          phone?: string | null
          postal_code?: string | null
          raw_notes?: string | null
          scan_pdf_url?: string | null
          skin_type?: string | null
          source_guest_id?: string | null
          state_territory?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "facial_contacts_converted_customer_id_fkey"
            columns: ["converted_customer_id"]
            isOneToOne: false
            referencedRelation: "customer_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "facial_contacts_converted_customer_id_fkey"
            columns: ["converted_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_settings: {
        Row: {
          cc_fee_rate: number
          created_at: string
          fee_in_person_flat: number
          fee_in_person_pct: number
          fee_keyed_flat: number
          fee_keyed_pct: number
          fee_online_flat: number
          fee_online_pct: number
          payment_processor: string
          profit_margin_rate: number
          tax_rate: number
          updated_at: string
          user_id: string
        }
        Insert: {
          cc_fee_rate?: number
          created_at?: string
          fee_in_person_flat?: number
          fee_in_person_pct?: number
          fee_keyed_flat?: number
          fee_keyed_pct?: number
          fee_online_flat?: number
          fee_online_pct?: number
          payment_processor?: string
          profit_margin_rate?: number
          tax_rate?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          cc_fee_rate?: number
          created_at?: string
          fee_in_person_flat?: number
          fee_in_person_pct?: number
          fee_keyed_flat?: number
          fee_keyed_pct?: number
          fee_online_flat?: number
          fee_online_pct?: number
          payment_processor?: string
          profit_margin_rate?: number
          tax_rate?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      focus_item_configs: {
        Row: {
          auto_track_key: string | null
          created_at: string
          default_target: number
          id: string
          label: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_track_key?: string | null
          created_at?: string
          default_target?: number
          id?: string
          label: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_track_key?: string | null
          created_at?: string
          default_target?: number
          id?: string
          label?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      habit_log: {
        Row: {
          created_at: string | null
          done: boolean
          habit_name: string
          id: number
          log_date: string
        }
        Insert: {
          created_at?: string | null
          done?: boolean
          habit_name: string
          id?: number
          log_date: string
        }
        Update: {
          created_at?: string | null
          done?: boolean
          habit_name?: string
          id?: number
          log_date?: string
        }
        Relationships: []
      }
      hostess_coaching_tasks: {
        Row: {
          created_at: string
          done: boolean
          done_at: string | null
          due_date: string
          event_id: string
          hostess_name: string
          id: string
          step: number
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          done_at?: string | null
          due_date: string
          event_id: string
          hostess_name?: string
          id?: string
          step: number
          text: string
          user_id?: string
        }
        Update: {
          created_at?: string
          done?: boolean
          done_at?: string | null
          due_date?: string
          event_id?: string
          hostess_name?: string
          id?: string
          step?: number
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hostess_coaching_tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_summary"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "hostess_coaching_tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["event_id"]
          },
        ]
      }
      income: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["income_category"]
          created_at: string
          id: string
          income_date: string
          notes: string | null
          owner_user_id: string | null
          source: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number
          category?: Database["public"]["Enums"]["income_category"]
          created_at?: string
          id?: string
          income_date?: string
          notes?: string | null
          owner_user_id?: string | null
          source?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["income_category"]
          created_at?: string
          id?: string
          income_date?: string
          notes?: string | null
          owner_user_id?: string | null
          source?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      leadership_members: {
        Row: {
          consultant_id: string | null
          created_at: string
          current_title: string | null
          email: string | null
          goal: string | null
          id: string
          name: string
          next_coaching_date: string | null
          notes: string | null
          owner_user_id: string | null
          personal_production: number | null
          phone: string | null
          unit_members: number | null
          unit_production: number | null
          updated_at: string | null
        }
        Insert: {
          consultant_id?: string | null
          created_at?: string
          current_title?: string | null
          email?: string | null
          goal?: string | null
          id?: string
          name: string
          next_coaching_date?: string | null
          notes?: string | null
          owner_user_id?: string | null
          personal_production?: number | null
          phone?: string | null
          unit_members?: number | null
          unit_production?: number | null
          updated_at?: string | null
        }
        Update: {
          consultant_id?: string | null
          created_at?: string
          current_title?: string | null
          email?: string | null
          goal?: string | null
          id?: string
          name?: string
          next_coaching_date?: string | null
          notes?: string | null
          owner_user_id?: string | null
          personal_production?: number | null
          phone?: string | null
          unit_members?: number | null
          unit_production?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leadership_members_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "team_consultants"
            referencedColumns: ["id"]
          },
        ]
      }
      momentum_goals: {
        Row: {
          created_at: string
          goal_value: number
          id: string
          is_visible: boolean
          metric_key: string
          metric_label: string
          period: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          goal_value?: number
          id?: string
          is_visible?: boolean
          metric_key: string
          metric_label: string
          period: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          goal_value?: number
          id?: string
          is_visible?: boolean
          metric_key?: string
          metric_label?: string
          period?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notes: {
        Row: {
          created_at: string
          customer_id: string | null
          entity_type: string
          id: string
          is_booking_attempt: boolean
          is_follow_up: boolean
          next_follow_up_date: string | null
          next_step: string | null
          note_body: string
          note_date: string
          note_type: string
          owner_user_id: string | null
          person_id: string | null
          person_type: string | null
          prospect_id: string | null
          result_type: string | null
          tags: string[]
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          entity_type: string
          id?: string
          is_booking_attempt?: boolean
          is_follow_up?: boolean
          next_follow_up_date?: string | null
          next_step?: string | null
          note_body: string
          note_date?: string
          note_type?: string
          owner_user_id?: string | null
          person_id?: string | null
          person_type?: string | null
          prospect_id?: string | null
          result_type?: string | null
          tags?: string[]
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          entity_type?: string
          id?: string
          is_booking_attempt?: boolean
          is_follow_up?: boolean
          next_follow_up_date?: string | null
          next_step?: string | null
          note_body?: string
          note_date?: string
          note_type?: string
          owner_user_id?: string | null
          person_id?: string | null
          person_type?: string | null
          prospect_id?: string | null
          result_type?: string | null
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          line_total: number | null
          order_id: string
          price: number
          product_name: string
          quantity: number
        }
        Insert: {
          id?: string
          line_total?: number | null
          order_id: string
          price?: number
          product_name: string
          quantity?: number
        }
        Update: {
          id?: string
          line_total?: number | null
          order_id?: string
          price?: number
          product_name?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_financials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          birthday: boolean | null
          cc_fee_amount: number
          cc_transaction_type: string | null
          consultant_id: string | null
          created_at: string
          customer_id: string | null
          customer_name: string | null
          discount_amount: number
          discount_type_ids: string[]
          event_id: string | null
          face_type: string | null
          half_price_deal: boolean | null
          hostess: boolean | null
          id: string
          is_myshop_order: boolean
          net_profit: number | null
          net_received: number | null
          notes: string | null
          order_date: string
          order_type: string | null
          owner_user_id: string | null
          parent_event_id: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          payment_type: string | null
          payout_amount: number | null
          referral: boolean | null
          retail_amount: number
          tax_amount: number
          thank_you_sent: boolean
          updated_at: string | null
          wholesale_amount: number | null
        }
        Insert: {
          birthday?: boolean | null
          cc_fee_amount?: number
          cc_transaction_type?: string | null
          consultant_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          discount_amount?: number
          discount_type_ids?: string[]
          event_id?: string | null
          face_type?: string | null
          half_price_deal?: boolean | null
          hostess?: boolean | null
          id?: string
          is_myshop_order?: boolean
          net_profit?: number | null
          net_received?: number | null
          notes?: string | null
          order_date?: string
          order_type?: string | null
          owner_user_id?: string | null
          parent_event_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          payment_type?: string | null
          payout_amount?: number | null
          referral?: boolean | null
          retail_amount?: number
          tax_amount?: number
          thank_you_sent?: boolean
          updated_at?: string | null
          wholesale_amount?: number | null
        }
        Update: {
          birthday?: boolean | null
          cc_fee_amount?: number
          cc_transaction_type?: string | null
          consultant_id?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          discount_amount?: number
          discount_type_ids?: string[]
          event_id?: string | null
          face_type?: string | null
          half_price_deal?: boolean | null
          hostess?: boolean | null
          id?: string
          is_myshop_order?: boolean
          net_profit?: number | null
          net_received?: number | null
          notes?: string | null
          order_date?: string
          order_type?: string | null
          owner_user_id?: string | null
          parent_event_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          payment_type?: string | null
          payout_amount?: number | null
          referral?: boolean | null
          retail_amount?: number
          tax_amount?: number
          thank_you_sent?: boolean
          updated_at?: string | null
          wholesale_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "team_consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          order_id: string
          payment_date: string
          payment_method: Database["public"]["Enums"]["payment_method"]
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          payment_date?: string
          payment_method: Database["public"]["Enums"]["payment_method"]
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          payment_date?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_financials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          current_stock: number
          id: string
          name: string
          price: number
        }
        Insert: {
          created_at?: string
          current_stock?: number
          id?: string
          name: string
          price?: number
        }
        Update: {
          created_at?: string
          current_stock?: number
          id?: string
          name?: string
          price?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          business_name: string | null
          consultant_notes: string | null
          consultant_status: Database["public"]["Enums"]["consultant_status"]
          created_at: string
          director_info: string | null
          email: string | null
          full_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          business_name?: string | null
          consultant_notes?: string | null
          consultant_status?: Database["public"]["Enums"]["consultant_status"]
          created_at?: string
          director_info?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          business_name?: string | null
          consultant_notes?: string | null
          consultant_status?: Database["public"]["Enums"]["consultant_status"]
          created_at?: string
          director_info?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      projects: {
        Row: {
          category: string
          created_at: string | null
          detail: string | null
          id: number
          notes: string | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          detail?: string | null
          id?: number
          notes?: string | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          detail?: string | null
          id?: number
          notes?: string | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      prospect_notes: {
        Row: {
          created_at: string
          id: string
          note_date: string
          note_text: string
          owner_user_id: string | null
          prospect_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note_date?: string
          note_text: string
          owner_user_id?: string | null
          prospect_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note_date?: string
          note_text?: string
          owner_user_id?: string | null
          prospect_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prospect_notes_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      prospects: {
        Row: {
          address_line_1: string | null
          allow_non_working_day: boolean
          assigned_consultant_id: string | null
          city: string | null
          created_at: string
          customer_id: string | null
          date_shared: string | null
          email: string | null
          id: string
          interest_level: number | null
          is_archived: boolean | null
          is_career_chat: boolean
          last_contact_date: string | null
          last_touch_layer: string | null
          name: string
          next_follow_up_date: string | null
          next_step_date: string | null
          next_step_notes: string | null
          next_step_type: string | null
          next_touch_layer: string | null
          notes: string | null
          opportunity_status: Database["public"]["Enums"]["opportunity_status"]
          owner_user_id: string | null
          ownership_type: string
          phone: string | null
          postal_code: string | null
          state_territory: string | null
          updated_at: string | null
        }
        Insert: {
          address_line_1?: string | null
          allow_non_working_day?: boolean
          assigned_consultant_id?: string | null
          city?: string | null
          created_at?: string
          customer_id?: string | null
          date_shared?: string | null
          email?: string | null
          id?: string
          interest_level?: number | null
          is_archived?: boolean | null
          is_career_chat?: boolean
          last_contact_date?: string | null
          last_touch_layer?: string | null
          name: string
          next_follow_up_date?: string | null
          next_step_date?: string | null
          next_step_notes?: string | null
          next_step_type?: string | null
          next_touch_layer?: string | null
          notes?: string | null
          opportunity_status?: Database["public"]["Enums"]["opportunity_status"]
          owner_user_id?: string | null
          ownership_type?: string
          phone?: string | null
          postal_code?: string | null
          state_territory?: string | null
          updated_at?: string | null
        }
        Update: {
          address_line_1?: string | null
          allow_non_working_day?: boolean
          assigned_consultant_id?: string | null
          city?: string | null
          created_at?: string
          customer_id?: string | null
          date_shared?: string | null
          email?: string | null
          id?: string
          interest_level?: number | null
          is_archived?: boolean | null
          is_career_chat?: boolean
          last_contact_date?: string | null
          last_touch_layer?: string | null
          name?: string
          next_follow_up_date?: string | null
          next_step_date?: string | null
          next_step_notes?: string | null
          next_step_type?: string | null
          next_touch_layer?: string | null
          notes?: string | null
          opportunity_status?: Database["public"]["Enums"]["opportunity_status"]
          owner_user_id?: string | null
          ownership_type?: string
          phone?: string | null
          postal_code?: string | null
          state_territory?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prospects_assigned_consultant_id_fkey"
            columns: ["assigned_consultant_id"]
            isOneToOne: false
            referencedRelation: "team_consultants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prospects_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      scripts: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_favorite: boolean
          owner_user_id: string | null
          script_text: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_favorite?: boolean
          owner_user_id?: string | null
          script_text?: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_favorite?: boolean
          owner_user_id?: string | null
          script_text?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_consultants: {
        Row: {
          activity_status_code: string | null
          address_line_1: string | null
          address_line_2: string | null
          allow_non_working_day: boolean
          attention_reason: string | null
          beauty_notes: Json
          became_customer_date: string | null
          birthday: string | null
          birthday_mmdd: string | null
          city: string | null
          coaching_focus: string | null
          consultant_id: string | null
          created_at: string
          customer_source: string | null
          date_added: string | null
          debut_date: string | null
          dormant_follow_up_stage: string | null
          email: string | null
          first_name: string | null
          first_order_date: string | null
          first_party_date: string | null
          first_team_member_date: string | null
          flagged_at: string | null
          focus_group: string | null
          follow_up_reason: string | null
          former_consultant_data: Json | null
          id: string
          is_skincare_customer: boolean
          join_date: string | null
          last_contacted: string | null
          last_name: string | null
          last_order_date: string | null
          name: string
          needs_attention: boolean
          new_customer_flag: boolean
          new_follow_up_stage: string | null
          next_coaching_date: string | null
          next_follow_up_date: string | null
          notes: string | null
          onboarding_exit_date: string | null
          onboarding_exit_status: string | null
          onboarding_stage: string | null
          onboarding_tracker: Json
          owner_user_id: string | null
          phone: string | null
          postal_code: string | null
          prospect_id: string | null
          relationship_type: string
          secondary_email: string | null
          secondary_phone: string | null
          skincare_started_at: string | null
          state_territory: string | null
          status: string
          tags: string[]
          updated_at: string | null
        }
        Insert: {
          activity_status_code?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          allow_non_working_day?: boolean
          attention_reason?: string | null
          beauty_notes?: Json
          became_customer_date?: string | null
          birthday?: string | null
          birthday_mmdd?: string | null
          city?: string | null
          coaching_focus?: string | null
          consultant_id?: string | null
          created_at?: string
          customer_source?: string | null
          date_added?: string | null
          debut_date?: string | null
          dormant_follow_up_stage?: string | null
          email?: string | null
          first_name?: string | null
          first_order_date?: string | null
          first_party_date?: string | null
          first_team_member_date?: string | null
          flagged_at?: string | null
          focus_group?: string | null
          follow_up_reason?: string | null
          former_consultant_data?: Json | null
          id?: string
          is_skincare_customer?: boolean
          join_date?: string | null
          last_contacted?: string | null
          last_name?: string | null
          last_order_date?: string | null
          name: string
          needs_attention?: boolean
          new_customer_flag?: boolean
          new_follow_up_stage?: string | null
          next_coaching_date?: string | null
          next_follow_up_date?: string | null
          notes?: string | null
          onboarding_exit_date?: string | null
          onboarding_exit_status?: string | null
          onboarding_stage?: string | null
          onboarding_tracker?: Json
          owner_user_id?: string | null
          phone?: string | null
          postal_code?: string | null
          prospect_id?: string | null
          relationship_type?: string
          secondary_email?: string | null
          secondary_phone?: string | null
          skincare_started_at?: string | null
          state_territory?: string | null
          status?: string
          tags?: string[]
          updated_at?: string | null
        }
        Update: {
          activity_status_code?: string | null
          address_line_1?: string | null
          address_line_2?: string | null
          allow_non_working_day?: boolean
          attention_reason?: string | null
          beauty_notes?: Json
          became_customer_date?: string | null
          birthday?: string | null
          birthday_mmdd?: string | null
          city?: string | null
          coaching_focus?: string | null
          consultant_id?: string | null
          created_at?: string
          customer_source?: string | null
          date_added?: string | null
          debut_date?: string | null
          dormant_follow_up_stage?: string | null
          email?: string | null
          first_name?: string | null
          first_order_date?: string | null
          first_party_date?: string | null
          first_team_member_date?: string | null
          flagged_at?: string | null
          focus_group?: string | null
          follow_up_reason?: string | null
          former_consultant_data?: Json | null
          id?: string
          is_skincare_customer?: boolean
          join_date?: string | null
          last_contacted?: string | null
          last_name?: string | null
          last_order_date?: string | null
          name?: string
          needs_attention?: boolean
          new_customer_flag?: boolean
          new_follow_up_stage?: string | null
          next_coaching_date?: string | null
          next_follow_up_date?: string | null
          notes?: string | null
          onboarding_exit_date?: string | null
          onboarding_exit_status?: string | null
          onboarding_stage?: string | null
          onboarding_tracker?: Json
          owner_user_id?: string | null
          phone?: string | null
          postal_code?: string | null
          prospect_id?: string | null
          relationship_type?: string
          secondary_email?: string | null
          secondary_phone?: string | null
          skincare_started_at?: string | null
          state_territory?: string | null
          status?: string
          tags?: string[]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_consultants_prospect_id_fkey"
            columns: ["prospect_id"]
            isOneToOne: false
            referencedRelation: "prospects"
            referencedColumns: ["id"]
          },
        ]
      }
      todos: {
        Row: {
          category: string
          created_at: string
          done: boolean
          id: string
          text: string
          todo_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          done?: boolean
          id?: string
          text: string
          todo_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          done?: boolean
          id?: string
          text?: string
          todo_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_id: string
          weekly_reset_day: number
          weekly_reset_last_dismissed: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          weekly_reset_day?: number
          weekly_reset_last_dismissed?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          weekly_reset_day?: number
          weekly_reset_last_dismissed?: string | null
        }
        Relationships: []
      }
      user_schedule_settings: {
        Row: {
          created_at: string
          daily_customer_followup_limit: number
          daily_lead_followup_limit: number
          id: string
          light_schedule_mode: boolean
          ooo_end_date: string | null
          ooo_followup_frozen_on: string | null
          ooo_followup_snapshot: Json | null
          ooo_start_date: string | null
          updated_at: string
          user_id: string
          workday_friday: boolean
          workday_monday: boolean
          workday_saturday: boolean
          workday_sunday: boolean
          workday_thursday: boolean
          workday_tuesday: boolean
          workday_wednesday: boolean
        }
        Insert: {
          created_at?: string
          daily_customer_followup_limit?: number
          daily_lead_followup_limit?: number
          id?: string
          light_schedule_mode?: boolean
          ooo_end_date?: string | null
          ooo_followup_frozen_on?: string | null
          ooo_followup_snapshot?: Json | null
          ooo_start_date?: string | null
          updated_at?: string
          user_id: string
          workday_friday?: boolean
          workday_monday?: boolean
          workday_saturday?: boolean
          workday_sunday?: boolean
          workday_thursday?: boolean
          workday_tuesday?: boolean
          workday_wednesday?: boolean
        }
        Update: {
          created_at?: string
          daily_customer_followup_limit?: number
          daily_lead_followup_limit?: number
          id?: string
          light_schedule_mode?: boolean
          ooo_end_date?: string | null
          ooo_followup_frozen_on?: string | null
          ooo_followup_snapshot?: Json | null
          ooo_start_date?: string | null
          updated_at?: string
          user_id?: string
          workday_friday?: boolean
          workday_monday?: boolean
          workday_saturday?: boolean
          workday_sunday?: boolean
          workday_thursday?: boolean
          workday_tuesday?: boolean
          workday_wednesday?: boolean
        }
        Relationships: []
      }
      weekly_goals: {
        Row: {
          bookings: number
          created_at: string
          id: string
          preset: string
          reach_outs: number
          sharings: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bookings?: number
          created_at?: string
          id?: string
          preset?: string
          reach_outs?: number
          sharings?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bookings?: number
          created_at?: string
          id?: string
          preset?: string
          reach_outs?: number
          sharings?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      zoom_defaults: {
        Row: {
          created_at: string
          home_office_address: string | null
          id: string
          updated_at: string
          user_id: string
          zoom_id: string | null
          zoom_link: string | null
          zoom_password: string | null
        }
        Insert: {
          created_at?: string
          home_office_address?: string | null
          id?: string
          updated_at?: string
          user_id: string
          zoom_id?: string | null
          zoom_link?: string | null
          zoom_password?: string | null
        }
        Update: {
          created_at?: string
          home_office_address?: string | null
          id?: string
          updated_at?: string
          user_id?: string
          zoom_id?: string | null
          zoom_link?: string | null
          zoom_password?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      customer_summary: {
        Row: {
          activity_status: string | null
          archived_at: string | null
          customer_source: string | null
          days_since_last_order: number | null
          email: string | null
          id: string | null
          is_active: boolean | null
          is_vip: boolean | null
          last_contact_date: string | null
          last_order_effective: string | null
          latest_note_preview: string | null
          lifetime_sales: number | null
          name: string | null
          next_follow_up_date: string | null
          owner_user_id: string | null
          phone: string | null
          relationship_status: string | null
          total_orders: number | null
          vip_display: string | null
        }
        Relationships: []
      }
      event_summary: {
        Row: {
          conversion_rate: number | null
          event_date: string | null
          event_id: string | null
          event_type: string | null
          future_bookings_count: number | null
          guest_count: number | null
          hostess_name: string | null
          id: string | null
          notes: string | null
          order_count: number | null
          ordering_guest_count: number | null
          owner_user_id: string | null
          sharing_appointments_count: number | null
          total_sales: number | null
        }
        Relationships: []
      }
      follow_up_queue: {
        Row: {
          activity_status: string | null
          days_overdue: number | null
          days_since_last_order: number | null
          email: string | null
          entity_id: string | null
          entity_type: string | null
          follow_up_reason: string | null
          is_vip: boolean | null
          name: string | null
          next_follow_up_date: string | null
          note_preview: string | null
          overdue_status: string | null
          phone: string | null
          relationship_status: string | null
          vip_display: string | null
        }
        Relationships: []
      }
      order_financials: {
        Row: {
          calculated_profit: number | null
          customer_id: string | null
          customer_name: string | null
          event_id: string | null
          id: string | null
          notes: string | null
          order_date: string | null
          order_type: string | null
          owner_user_id: string | null
          payment_type: string | null
          payout_amount: number | null
          retail_amount: number | null
          wholesale_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customer_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      check_profile_update_safe: {
        Args: {
          _is_active: boolean
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      convert_person: {
        Args: { _from_id: string; _from_type: string; _overrides?: Json }
        Returns: Json
      }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_any_active_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_internal_user: { Args: { _user_id: string }; Returns: boolean }
      merge_consultants: {
        Args: { _dup_id: string; _keep_id: string }
        Returns: Json
      }
      merge_customer_into_consultant: {
        Args: { _consultant_id: string; _customer_id: string }
        Returns: Json
      }
      merge_customers: {
        Args: { _dup_id: string; _keep_id: string }
        Returns: Json
      }
      normalize_phone: { Args: { p: string }; Returns: string }
    }
    Enums: {
      app_role: "owner" | "admin" | "staff" | "consultant" | "customer"
      booking_lead_status:
        | "New Contact"
        | "Working"
        | "Booked"
        | "Not Interested"
        | "Warm"
        | "Converted"
      consultant_status: "none" | "pending" | "approved" | "rejected"
      expense_category:
        | "Inventory"
        | "Supplies"
        | "Marketing"
        | "Events"
        | "Tools"
        | "Other"
        | "Admin / Office Help"
        | "Accounting"
        | "Meals"
        | "Travel"
        | "Networking"
        | "Section 1 (Wholesale Products)"
        | "Section 2 (MK Supplies & Samples)"
        | "Inventory Freight"
        | "Shipping / Postage"
        | "Gifts & Prizes - Customers"
        | "Prizes & Promotions - Consultants"
        | "Business Gifts"
        | "Unit Events & Meetings"
        | "Personal Use"
        | "Demos & Samples"
      income_category: "Commission" | "Bonus" | "Referral" | "Other"
      opportunity_status:
        | "New Contact"
        | "Shared"
        | "Follow-Up"
        | "Interested"
        | "Not Interested"
        | "Joined"
        | "Booked"
        | "Converted"
        | "Closed"
        | "Warm"
        | "Working"
      order_source: "Online" | "Phone" | "Text" | "Event" | "Other"
      payment_method: "Cash" | "Check" | "Venmo" | "Zelle" | "Card" | "Other"
      payment_status: "Paid" | "Unpaid" | "Partial"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "admin", "staff", "consultant", "customer"],
      booking_lead_status: [
        "New Contact",
        "Working",
        "Booked",
        "Not Interested",
        "Warm",
        "Converted",
      ],
      consultant_status: ["none", "pending", "approved", "rejected"],
      expense_category: [
        "Inventory",
        "Supplies",
        "Marketing",
        "Events",
        "Tools",
        "Other",
        "Admin / Office Help",
        "Accounting",
        "Meals",
        "Travel",
        "Networking",
        "Section 1 (Wholesale Products)",
        "Section 2 (MK Supplies & Samples)",
        "Inventory Freight",
        "Shipping / Postage",
        "Gifts & Prizes - Customers",
        "Prizes & Promotions - Consultants",
        "Business Gifts",
        "Unit Events & Meetings",
        "Personal Use",
        "Demos & Samples",
      ],
      income_category: ["Commission", "Bonus", "Referral", "Other"],
      opportunity_status: [
        "New Contact",
        "Shared",
        "Follow-Up",
        "Interested",
        "Not Interested",
        "Joined",
        "Booked",
        "Converted",
        "Closed",
        "Warm",
        "Working",
      ],
      order_source: ["Online", "Phone", "Text", "Event", "Other"],
      payment_method: ["Cash", "Check", "Venmo", "Zelle", "Card", "Other"],
      payment_status: ["Paid", "Unpaid", "Partial"],
    },
  },
} as const
