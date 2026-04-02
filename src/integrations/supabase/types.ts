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
          birthday_mmdd: string | null
          city: string | null
          created_at: string
          email: string | null
          follow_up_reason: string | null
          full_name: string
          id: string
          is_active: boolean
          last_contacted: string | null
          last_order_date_order_log: string | null
          last_order_mk: string | null
          new_follow_up_stage: string | null
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
          birthday_mmdd?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          follow_up_reason?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          last_contacted?: string | null
          last_order_date_order_log?: string | null
          last_order_mk?: string | null
          new_follow_up_stage?: string | null
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
          birthday_mmdd?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          follow_up_reason?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          last_contacted?: string | null
          last_order_date_order_log?: string | null
          last_order_mk?: string | null
          new_follow_up_stage?: string | null
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
      events: {
        Row: {
          created_at: string
          event_date: string | null
          event_id: string
          event_type: string | null
          guest_count: number | null
          hostess_name: string | null
          id: string
          notes: string | null
          owner_user_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          event_date?: string | null
          event_id: string
          event_type?: string | null
          guest_count?: number | null
          hostess_name?: string | null
          id?: string
          notes?: string | null
          owner_user_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          event_date?: string | null
          event_id?: string
          event_type?: string | null
          guest_count?: number | null
          hostess_name?: string | null
          id?: string
          notes?: string | null
          owner_user_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          expense_date: string
          id: string
          notes: string | null
          owner_user_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          expense_date?: string
          id?: string
          notes?: string | null
          owner_user_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          expense_date?: string
          id?: string
          notes?: string | null
          owner_user_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
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
          payment_type: string | null
          referral: boolean | null
          retail_amount: number
          updated_at: string | null
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
          payment_type?: string | null
          referral?: boolean | null
          retail_amount?: number
          updated_at?: string | null
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
          payment_type?: string | null
          referral?: boolean | null
          retail_amount?: number
          updated_at?: string | null
        }
        Relationships: [
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
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
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
      consultant_status: "none" | "pending" | "approved" | "rejected"
      expense_category:
        | "Inventory"
        | "Supplies"
        | "Marketing"
        | "Events"
        | "Tools"
        | "Other"
      opportunity_status:
        | "New"
        | "Shared"
        | "Follow-Up"
        | "Interested"
        | "Not Interested"
        | "Joined"
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
      consultant_status: ["none", "pending", "approved", "rejected"],
      expense_category: [
        "Inventory",
        "Supplies",
        "Marketing",
        "Events",
        "Tools",
        "Other",
      ],
      opportunity_status: [
        "New",
        "Shared",
        "Follow-Up",
        "Interested",
        "Not Interested",
        "Joined",
      ],
      order_source: ["Online", "Phone", "Text", "Event", "Other"],
      payment_method: ["Cash", "Check", "Venmo", "Zelle", "Card", "Other"],
      payment_status: ["Paid", "Unpaid", "Partial"],
    },
  },
} as const
