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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      booking_leads: {
        Row: {
          converted_customer_id: string | null
          created_at: string
          email: string | null
          id: string
          last_contact_date: string | null
          lead_activity: string | null
          lead_source: string | null
          name: string
          next_follow_up_date: string | null
          notes: string | null
          owner_user_id: string | null
          phone: string | null
          status: Database["public"]["Enums"]["booking_lead_status"]
          updated_at: string | null
        }
        Insert: {
          converted_customer_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_contact_date?: string | null
          lead_activity?: string | null
          lead_source?: string | null
          name: string
          next_follow_up_date?: string | null
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["booking_lead_status"]
          updated_at?: string | null
        }
        Update: {
          converted_customer_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_contact_date?: string | null
          lead_activity?: string | null
          lead_source?: string | null
          name?: string
          next_follow_up_date?: string | null
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["booking_lead_status"]
          updated_at?: string | null
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
          created_at: string
          customer_id: string
          id: string
          note_text: string
          note_type: string
          owner_user_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          note_text: string
          note_type?: string
          owner_user_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          note_text?: string
          note_type?: string
          owner_user_id?: string | null
        }
        Relationships: [
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
          archived_at: string | null
          birthday: string | null
          birthday_mmdd: string | null
          city: string | null
          created_at: string
          customer_source: string | null
          dormant_follow_up_stage: string | null
          email: string | null
          follow_up_reason: string | null
          full_name: string
          id: string
          is_active: boolean
          last_contacted: string | null
          last_order_date_order_log: string | null
          last_order_mk: string | null
          new_customer_flag: boolean
          new_follow_up_stage: string | null
          next_follow_up_date: string | null
          notes: string | null
          owner_user_id: string | null
          phone: string | null
          postal_code: string | null
          profile_date_first_order_date: string | null
          relationship_status: string | null
          state_territory: string | null
          updated_at: string | null
        }
        Insert: {
          address_line_1?: string | null
          address_line_2?: string | null
          archived_at?: string | null
          birthday?: string | null
          birthday_mmdd?: string | null
          city?: string | null
          created_at?: string
          customer_source?: string | null
          dormant_follow_up_stage?: string | null
          email?: string | null
          follow_up_reason?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          last_contacted?: string | null
          last_order_date_order_log?: string | null
          last_order_mk?: string | null
          new_customer_flag?: boolean
          new_follow_up_stage?: string | null
          next_follow_up_date?: string | null
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          postal_code?: string | null
          profile_date_first_order_date?: string | null
          relationship_status?: string | null
          state_territory?: string | null
          updated_at?: string | null
        }
        Update: {
          address_line_1?: string | null
          address_line_2?: string | null
          archived_at?: string | null
          birthday?: string | null
          birthday_mmdd?: string | null
          city?: string | null
          created_at?: string
          customer_source?: string | null
          dormant_follow_up_stage?: string | null
          email?: string | null
          follow_up_reason?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          last_contacted?: string | null
          last_order_date_order_log?: string | null
          last_order_mk?: string | null
          new_customer_flag?: boolean
          new_follow_up_stage?: string | null
          next_follow_up_date?: string | null
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          postal_code?: string | null
          profile_date_first_order_date?: string | null
          relationship_status?: string | null
          state_territory?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      daily_plan_items: {
        Row: {
          address: string | null
          created_at: string
          customer_id: string | null
          customer_name: string
          event_location: string | null
          event_time: string | null
          id: string
          item_type: string
          notes: string | null
          owner_user_id: string | null
          phone: string | null
          plan_date: string
          sort_order: number
        }
        Insert: {
          address?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          event_location?: string | null
          event_time?: string | null
          id?: string
          item_type: string
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          plan_date?: string
          sort_order?: number
        }
        Update: {
          address?: string | null
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          event_location?: string | null
          event_time?: string | null
          id?: string
          item_type?: string
          notes?: string | null
          owner_user_id?: string | null
          phone?: string | null
          plan_date?: string
          sort_order?: number
        }
        Relationships: []
      }
      event_guests: {
        Row: {
          attending: boolean | null
          booked: boolean | null
          converted_customer_id: string | null
          created_at: string
          event_id: string
          id: string
          interested: boolean | null
          name: string
          notes: string | null
          ordered: boolean | null
          owner_user_id: string | null
          phone: string | null
          rsvp: string | null
        }
        Insert: {
          attending?: boolean | null
          booked?: boolean | null
          converted_customer_id?: string | null
          created_at?: string
          event_id: string
          id?: string
          interested?: boolean | null
          name: string
          notes?: string | null
          ordered?: boolean | null
          owner_user_id?: string | null
          phone?: string | null
          rsvp?: string | null
        }
        Update: {
          attending?: boolean | null
          booked?: boolean | null
          converted_customer_id?: string | null
          created_at?: string
          event_id?: string
          id?: string
          interested?: boolean | null
          name?: string
          notes?: string | null
          ordered?: boolean | null
          owner_user_id?: string | null
          phone?: string | null
          rsvp?: string | null
        }
        Relationships: []
      }
      event_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          due_date: string | null
          event_id: string
          id: string
          is_completed: boolean
          owner_user_id: string | null
          task_name: string
          task_type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          event_id: string
          id?: string
          is_completed?: boolean
          owner_user_id?: string | null
          task_name: string
          task_type: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          event_id?: string
          id?: string
          is_completed?: boolean
          owner_user_id?: string | null
          task_name?: string
          task_type?: string
        }
        Relationships: []
      }
      events: {
        Row: {
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
          event_status: string
          event_time: string | null
          event_type: string | null
          future_bookings_count: number | null
          google_form_link: string | null
          guest_count: number | null
          hostess_email: string | null
          hostess_name: string | null
          hostess_next_action: string | null
          hostess_next_action_date: string | null
          hostess_phone: string | null
          id: string
          is_archived: boolean | null
          notes: string | null
          ordering_guest_count: number | null
          owner_user_id: string | null
          sharing_appointments_count: number | null
          updated_at: string | null
        }
        Insert: {
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
          event_status?: string
          event_time?: string | null
          event_type?: string | null
          future_bookings_count?: number | null
          google_form_link?: string | null
          guest_count?: number | null
          hostess_email?: string | null
          hostess_name?: string | null
          hostess_next_action?: string | null
          hostess_next_action_date?: string | null
          hostess_phone?: string | null
          id?: string
          is_archived?: boolean | null
          notes?: string | null
          ordering_guest_count?: number | null
          owner_user_id?: string | null
          sharing_appointments_count?: number | null
          updated_at?: string | null
        }
        Update: {
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
          event_status?: string
          event_time?: string | null
          event_type?: string | null
          future_bookings_count?: number | null
          google_form_link?: string | null
          guest_count?: number | null
          hostess_email?: string | null
          hostess_name?: string | null
          hostess_next_action?: string | null
          hostess_next_action_date?: string | null
          hostess_phone?: string | null
          id?: string
          is_archived?: boolean | null
          notes?: string | null
          ordering_guest_count?: number | null
          owner_user_id?: string | null
          sharing_appointments_count?: number | null
          updated_at?: string | null
        }
        Relationships: []
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
      notes: {
        Row: {
          created_at: string
          customer_id: string | null
          entity_type: string
          id: string
          next_follow_up_date: string | null
          note_body: string
          note_date: string
          note_type: string
          owner_user_id: string | null
          prospect_id: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          entity_type: string
          id?: string
          next_follow_up_date?: string | null
          note_body: string
          note_date?: string
          note_type?: string
          owner_user_id?: string | null
          prospect_id?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          entity_type?: string
          id?: string
          next_follow_up_date?: string | null
          note_body?: string
          note_date?: string
          note_type?: string
          owner_user_id?: string | null
          prospect_id?: string | null
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
          created_at: string
          customer_id: string
          customer_name: string | null
          event_id: string | null
          face_type: string | null
          half_price_deal: boolean | null
          hostess: boolean | null
          id: string
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
          updated_at: string | null
          wholesale_amount: number | null
        }
        Insert: {
          birthday?: boolean | null
          created_at?: string
          customer_id: string
          customer_name?: string | null
          event_id?: string | null
          face_type?: string | null
          half_price_deal?: boolean | null
          hostess?: boolean | null
          id?: string
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
          updated_at?: string | null
          wholesale_amount?: number | null
        }
        Update: {
          birthday?: boolean | null
          created_at?: string
          customer_id?: string
          customer_name?: string | null
          event_id?: string | null
          face_type?: string | null
          half_price_deal?: boolean | null
          hostess?: boolean | null
          id?: string
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
          updated_at?: string | null
          wholesale_amount?: number | null
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
      prospect_notes: {
        Row: {
          created_at: string
          id: string
          note_text: string
          owner_user_id: string | null
          prospect_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note_text: string
          owner_user_id?: string | null
          prospect_id: string
        }
        Update: {
          created_at?: string
          id?: string
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
          created_at: string
          customer_id: string | null
          date_shared: string | null
          email: string | null
          id: string
          last_contact_date: string | null
          name: string
          next_follow_up_date: string | null
          next_step_date: string | null
          next_step_notes: string | null
          next_step_type: string | null
          notes: string | null
          opportunity_status: Database["public"]["Enums"]["opportunity_status"]
          owner_user_id: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          date_shared?: string | null
          email?: string | null
          id?: string
          last_contact_date?: string | null
          name: string
          next_follow_up_date?: string | null
          next_step_date?: string | null
          next_step_notes?: string | null
          next_step_type?: string | null
          notes?: string | null
          opportunity_status?: Database["public"]["Enums"]["opportunity_status"]
          owner_user_id?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          date_shared?: string | null
          email?: string | null
          id?: string
          last_contact_date?: string | null
          name?: string
          next_follow_up_date?: string | null
          next_step_date?: string | null
          next_step_notes?: string | null
          next_step_type?: string | null
          notes?: string | null
          opportunity_status?: Database["public"]["Enums"]["opportunity_status"]
          owner_user_id?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: [
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
      team_consultants: {
        Row: {
          address_line_1: string | null
          birthday: string | null
          city: string | null
          coaching_focus: string | null
          consultant_id: string | null
          created_at: string
          email: string | null
          first_name: string | null
          first_order_date: string | null
          first_party_date: string | null
          first_team_member_date: string | null
          focus_group: string | null
          id: string
          join_date: string | null
          last_name: string | null
          last_order_date: string | null
          name: string
          next_coaching_date: string | null
          notes: string | null
          onboarding_stage: string | null
          owner_user_id: string | null
          phone: string | null
          postal_code: string | null
          prospect_id: string | null
          secondary_email: string | null
          secondary_phone: string | null
          state_territory: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          address_line_1?: string | null
          birthday?: string | null
          city?: string | null
          coaching_focus?: string | null
          consultant_id?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          first_order_date?: string | null
          first_party_date?: string | null
          first_team_member_date?: string | null
          focus_group?: string | null
          id?: string
          join_date?: string | null
          last_name?: string | null
          last_order_date?: string | null
          name: string
          next_coaching_date?: string | null
          notes?: string | null
          onboarding_stage?: string | null
          owner_user_id?: string | null
          phone?: string | null
          postal_code?: string | null
          prospect_id?: string | null
          secondary_email?: string | null
          secondary_phone?: string | null
          state_territory?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          address_line_1?: string | null
          birthday?: string | null
          city?: string | null
          coaching_focus?: string | null
          consultant_id?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          first_order_date?: string | null
          first_party_date?: string | null
          first_team_member_date?: string | null
          focus_group?: string | null
          id?: string
          join_date?: string | null
          last_name?: string | null
          last_order_date?: string | null
          name?: string
          next_coaching_date?: string | null
          notes?: string | null
          onboarding_stage?: string | null
          owner_user_id?: string | null
          phone?: string | null
          postal_code?: string | null
          prospect_id?: string | null
          secondary_email?: string | null
          secondary_phone?: string | null
          state_territory?: string | null
          status?: string
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
      user_schedule_settings: {
        Row: {
          created_at: string
          id: string
          light_schedule_mode: boolean
          ooo_end_date: string | null
          ooo_start_date: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          light_schedule_mode?: boolean
          ooo_end_date?: string | null
          ooo_start_date?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          light_schedule_mode?: boolean
          ooo_end_date?: string | null
          ooo_start_date?: string | null
          updated_at?: string
          user_id?: string
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
    }
    Enums: {
      app_role: "owner" | "admin" | "staff" | "consultant" | "customer"
      booking_lead_status: "New" | "Contacted" | "Booked" | "Not Interested"
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
      income_category: "Commission" | "Bonus" | "Referral" | "Other"
      opportunity_status:
        | "New"
        | "Shared"
        | "Follow-Up"
        | "Interested"
        | "Not Interested"
        | "Joined"
        | "Booked"
        | "Converted"
        | "Closed"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      booking_lead_status: ["New", "Contacted", "Booked", "Not Interested"],
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
      ],
      income_category: ["Commission", "Bonus", "Referral", "Other"],
      opportunity_status: [
        "New",
        "Shared",
        "Follow-Up",
        "Interested",
        "Not Interested",
        "Joined",
        "Booked",
        "Converted",
        "Closed",
      ],
      order_source: ["Online", "Phone", "Text", "Event", "Other"],
      payment_method: ["Cash", "Check", "Venmo", "Zelle", "Card", "Other"],
      payment_status: ["Paid", "Unpaid", "Partial"],
    },
  },
} as const
