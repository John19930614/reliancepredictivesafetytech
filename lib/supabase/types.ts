export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      brainstorming_parking_lot_categories: {
        Row: {
          id: string;
          slug: string;
          title: string;
          description: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          title: string;
          description?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["brainstorming_parking_lot_categories"]["Insert"]>;
        Relationships: [];
      };
      brainstorming_parking_lot_cards: {
        Row: {
          id: string;
          category_id: string;
          title: string;
          description: string;
          lane: string;
          sort_order: number;
          owner: string | null;
          priority: string;
          notes: string;
          is_placeholder: boolean;
          placeholder_slot: number | null;
          created_by_user_id: string | null;
          updated_by_user_id: string | null;
          archived_by_user_id: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          category_id: string;
          title: string;
          description?: string;
          lane?: string;
          sort_order?: number;
          owner?: string | null;
          priority?: string;
          notes?: string;
          is_placeholder?: boolean;
          placeholder_slot?: number | null;
          created_by_user_id?: string | null;
          updated_by_user_id?: string | null;
          archived_by_user_id?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["brainstorming_parking_lot_cards"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "brainstorming_parking_lot_cards_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "brainstorming_parking_lot_categories";
            referencedColumns: ["id"];
          },
        ];
      };
      portal_notifications: {
        Row: {
          id: string;
          recipient_user_id: string;
          title: string;
          body: string;
          priority: string;
          source_type: string | null;
          source_id: string | null;
          action_href: string | null;
          ai_summary: string | null;
          dedupe_key: string | null;
          status: string;
          created_by_ai: boolean;
          metadata: Json;
          read_at: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          recipient_user_id: string;
          title: string;
          body: string;
          priority?: string;
          source_type?: string | null;
          source_id?: string | null;
          action_href?: string | null;
          ai_summary?: string | null;
          dedupe_key?: string | null;
          status?: string;
          created_by_ai?: boolean;
          metadata?: Json;
          read_at?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["portal_notifications"]["Insert"]>;
        Relationships: [];
      };
      support_tickets: {
        Row: {
          id: string;
          submitter_name: string;
          submitter_email: string;
          submitter_phone: string | null;
          company: string | null;
          subject: string;
          category: string;
          priority: string;
          issue_url: string | null;
          message: string;
          status: string;
          submitted_by_user_id: string | null;
          assigned_to_user_id: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          submitter_name: string;
          submitter_email: string;
          submitter_phone?: string | null;
          company?: string | null;
          subject: string;
          category?: string;
          priority?: string;
          issue_url?: string | null;
          message: string;
          status?: string;
          submitted_by_user_id?: string | null;
          assigned_to_user_id?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["support_tickets"]["Insert"]>;
        Relationships: [];
      };
      support_ticket_recipients: {
        Row: {
          recipient_user_id: string;
          label: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          recipient_user_id: string;
          label?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["support_ticket_recipients"]["Insert"]>;
        Relationships: [];
      };
      notification_preferences: {
        Row: {
          user_id: string;
          in_app_enabled: boolean;
          email_digest_enabled: boolean;
          digest_time: string;
          digest_timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          in_app_enabled?: boolean;
          email_digest_enabled?: boolean;
          digest_time?: string;
          digest_timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notification_preferences"]["Insert"]>;
        Relationships: [];
      };
      workflow_action_proposals: {
        Row: {
          id: string;
          created_by_user_id: string | null;
          target_user_id: string | null;
          title: string;
          description: string;
          action_type: string;
          target_table: string;
          target_record_id: string | null;
          proposed_patch: Json;
          risk_level: string;
          status: string;
          approval_notes: string | null;
          approved_by: string | null;
          approved_at: string | null;
          applied_at: string | null;
          created_by_ai: boolean;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          created_by_user_id?: string | null;
          target_user_id?: string | null;
          title: string;
          description: string;
          action_type: string;
          target_table: string;
          target_record_id?: string | null;
          proposed_patch?: Json;
          risk_level?: string;
          status?: string;
          approval_notes?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          applied_at?: string | null;
          created_by_ai?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["workflow_action_proposals"]["Insert"]>;
        Relationships: [];
      };
      ai_digest_runs: {
        Row: {
          id: string;
          user_id: string;
          digest_date: string;
          status: string;
          notification_count: number;
          email_to: string | null;
          resend_email_id: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          digest_date: string;
          status?: string;
          notification_count?: number;
          email_to?: string | null;
          resend_email_id?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_digest_runs"]["Insert"]>;
        Relationships: [];
      };
      website_content_items: {
        Row: {
          id: string;
          content_key: string;
          route_path: string;
          content_type: string;
          title: string;
          fallback_value: string;
          draft_value: string | null;
          approved_value: string | null;
          status: string;
          risk_level: string;
          ai_notes: string | null;
          created_by: string | null;
          approved_by: string | null;
          approved_at: string | null;
          created_by_ai: boolean;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          content_key: string;
          route_path?: string;
          content_type?: string;
          title: string;
          fallback_value?: string;
          draft_value?: string | null;
          approved_value?: string | null;
          status?: string;
          risk_level?: string;
          ai_notes?: string | null;
          created_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_by_ai?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["website_content_items"]["Insert"]>;
        Relationships: [];
      };
      website_health_checks: {
        Row: {
          id: string;
          scan_id: string;
          route_path: string;
          target_url: string;
          status: string;
          status_code: number | null;
          response_ms: number | null;
          checked_at: string;
          error_message: string | null;
          seo_title: string | null;
          seo_description: string | null;
          h1: string | null;
          broken_links: Json;
          content_gaps: string[];
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          scan_id?: string;
          route_path: string;
          target_url: string;
          status?: string;
          status_code?: number | null;
          response_ms?: number | null;
          checked_at?: string;
          error_message?: string | null;
          seo_title?: string | null;
          seo_description?: string | null;
          h1?: string | null;
          broken_links?: Json;
          content_gaps?: string[];
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["website_health_checks"]["Insert"]>;
        Relationships: [];
      };
      website_operations_events: {
        Row: {
          id: string;
          actor_user_id: string | null;
          notification_id: string | null;
          health_check_id: string | null;
          proposal_id: string | null;
          source_type: string;
          source_id: string | null;
          event_type: string;
          title: string;
          body: string | null;
          risk_level: string;
          created_by_ai: boolean;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_user_id?: string | null;
          notification_id?: string | null;
          health_check_id?: string | null;
          proposal_id?: string | null;
          source_type: string;
          source_id?: string | null;
          event_type: string;
          title: string;
          body?: string | null;
          risk_level?: string;
          created_by_ai?: boolean;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["website_operations_events"]["Insert"]>;
        Relationships: [];
      };
      hr_candidate_intakes: {
        Row: {
          id: string;
          candidate_name: string;
          email: string;
          target_role: string;
          jurisdiction_state: string | null;
          source: string | null;
          status: string;
          notes: string | null;
          human_decision: string;
          human_decision_notes: string | null;
          decided_by: string | null;
          decided_at: string | null;
          converted_user_id: string | null;
          invite_generated_at: string | null;
          created_by: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          candidate_name: string;
          email: string;
          target_role?: string;
          jurisdiction_state?: string | null;
          source?: string | null;
          status?: string;
          notes?: string | null;
          human_decision?: string;
          human_decision_notes?: string | null;
          decided_by?: string | null;
          decided_at?: string | null;
          converted_user_id?: string | null;
          invite_generated_at?: string | null;
          created_by?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["hr_candidate_intakes"]["Insert"]>;
        Relationships: [];
      };
      employee_payroll_setup_tasks: {
        Row: {
          id: string;
          user_id: string;
          source_candidate_id: string | null;
          status: string;
          jurisdiction_state: string | null;
          payroll_provider: string | null;
          due_date: string | null;
          w4_received: boolean;
          i9_reviewed: boolean;
          direct_deposit_ready: boolean;
          state_new_hire_reported: boolean;
          benefits_reviewed: boolean;
          reviewed_by: string | null;
          reviewed_at: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          source_candidate_id?: string | null;
          status?: string;
          jurisdiction_state?: string | null;
          payroll_provider?: string | null;
          due_date?: string | null;
          w4_received?: boolean;
          i9_reviewed?: boolean;
          direct_deposit_ready?: boolean;
          state_new_hire_reported?: boolean;
          benefits_reviewed?: boolean;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_payroll_setup_tasks"]["Insert"]>;
        Relationships: [];
      };
      hr_automation_events: {
        Row: {
          id: string;
          actor_user_id: string | null;
          target_user_id: string | null;
          candidate_intake_id: string | null;
          notification_id: string | null;
          source_type: string;
          source_id: string | null;
          event_type: string;
          title: string;
          body: string | null;
          created_by_ai: boolean;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_user_id?: string | null;
          target_user_id?: string | null;
          candidate_intake_id?: string | null;
          notification_id?: string | null;
          source_type: string;
          source_id?: string | null;
          event_type: string;
          title: string;
          body?: string | null;
          created_by_ai?: boolean;
          metadata?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["hr_automation_events"]["Insert"]>;
        Relationships: [];
      };
      time_card_roles: {
        Row: {
          id: string;
          slug: string;
          name: string;
          description: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          description?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["time_card_roles"]["Insert"]>;
        Relationships: [];
      };
      time_card_categories: {
        Row: {
          id: string;
          slug: string;
          name: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["time_card_categories"]["Insert"]>;
        Relationships: [];
      };
      time_card_tasks: {
        Row: {
          id: string;
          slug: string;
          category_id: string;
          title: string;
          sort_order: number;
          is_review_task: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          category_id: string;
          title: string;
          sort_order?: number;
          is_review_task?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["time_card_tasks"]["Insert"]>;
        Relationships: [];
      };
      time_card_role_categories: {
        Row: {
          role_id: string;
          category_id: string;
          created_at: string;
        };
        Insert: {
          role_id: string;
          category_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["time_card_role_categories"]["Insert"]>;
        Relationships: [];
      };
      time_card_role_tasks: {
        Row: {
          role_id: string;
          task_id: string;
          created_at: string;
        };
        Insert: {
          role_id: string;
          task_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["time_card_role_tasks"]["Insert"]>;
        Relationships: [];
      };
      employee_pay_rates: {
        Row: {
          user_id: string;
          hourly_rate: number;
          effective_date: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          hourly_rate?: number;
          effective_date?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_pay_rates"]["Insert"]>;
        Relationships: [];
      };
      employee_time_cards: {
        Row: {
          id: string;
          employee_user_id: string | null;
          week_start: string;
          week_end: string;
          status: string;
          source: string;
          import_key: string | null;
          submitted_at: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          review_notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          employee_user_id?: string | null;
          week_start: string;
          week_end: string;
          status?: string;
          source?: string;
          import_key?: string | null;
          submitted_at?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          review_notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_time_cards"]["Insert"]>;
        Relationships: [];
      };
      employee_time_entries: {
        Row: {
          id: string;
          time_card_id: string;
          work_date: string;
          category_id: string;
          task_id: string;
          hours: number;
          notes: string | null;
          source_status: string | null;
          import_key: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          time_card_id: string;
          work_date: string;
          category_id: string;
          task_id: string;
          hours: number;
          notes?: string | null;
          source_status?: string | null;
          import_key?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_time_entries"]["Insert"]>;
        Relationships: [];
      };
      employee_time_card_payroll: {
        Row: {
          time_card_id: string;
          hourly_rate: number;
          total_hours: number;
          paid_value: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          time_card_id: string;
          hourly_rate?: number;
          total_hours?: number;
          paid_value?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_time_card_payroll"]["Insert"]>;
        Relationships: [];
      };
      employee_payroll_runs: {
        Row: {
          id: string;
          period_start: string;
          period_end: string;
          status: string;
          notes: string | null;
          created_by: string | null;
          paid_at: string | null;
          paid_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          period_start: string;
          period_end: string;
          status?: string;
          notes?: string | null;
          created_by?: string | null;
          paid_at?: string | null;
          paid_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_payroll_runs"]["Insert"]>;
        Relationships: [];
      };
      employee_payroll_run_items: {
        Row: {
          id: string;
          payroll_run_id: string;
          time_card_id: string;
          employee_user_id: string | null;
          total_hours: number;
          hourly_rate: number;
          gross_pay: number;
          item_status: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          payroll_run_id: string;
          time_card_id: string;
          employee_user_id?: string | null;
          total_hours?: number;
          hourly_rate?: number;
          gross_pay?: number;
          item_status?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_payroll_run_items"]["Insert"]>;
        Relationships: [];
      };
      company_finance_authorized_users: {
        Row: {
          user_id: string;
          access_label: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          access_label?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["company_finance_authorized_users"]["Insert"]>;
        Relationships: [];
      };
      company_finance_transactions: {
        Row: {
          id: string;
          transaction_type: string;
          title: string;
          amount: number;
          transaction_date: string;
          category: string;
          status: string;
          vendor_customer: string | null;
          payment_method: string | null;
          owner: string | null;
          notes: string | null;
          related_client_id: string | null;
          related_document_id: string | null;
          created_by: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          review_status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          transaction_type: string;
          title: string;
          amount: number;
          transaction_date?: string;
          category: string;
          status: string;
          vendor_customer?: string | null;
          payment_method?: string | null;
          owner?: string | null;
          notes?: string | null;
          related_client_id?: string | null;
          related_document_id?: string | null;
          created_by?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          review_status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["company_finance_transactions"]["Insert"]>;
        Relationships: [];
      };
      company_finance_budgets: {
        Row: {
          id: string;
          name: string;
          budget_type: string;
          category: string;
          period: string;
          period_start: string;
          amount: number;
          owner: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          budget_type: string;
          category: string;
          period?: string;
          period_start: string;
          amount: number;
          owner?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["company_finance_budgets"]["Insert"]>;
        Relationships: [];
      };
      company_finance_recurring_items: {
        Row: {
          id: string;
          item_type: string;
          title: string;
          amount: number;
          category: string;
          cadence: string;
          next_due_date: string | null;
          status: string;
          vendor_customer: string | null;
          payment_method: string | null;
          owner: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          item_type: string;
          title: string;
          amount: number;
          category: string;
          cadence?: string;
          next_due_date?: string | null;
          status?: string;
          vendor_customer?: string | null;
          payment_method?: string | null;
          owner?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["company_finance_recurring_items"]["Insert"]>;
        Relationships: [];
      };
      company_finance_receipts: {
        Row: {
          id: string;
          transaction_id: string;
          file_path: string;
          file_name: string;
          file_type: string | null;
          file_size: number | null;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          transaction_id: string;
          file_path: string;
          file_name: string;
          file_type?: string | null;
          file_size?: number | null;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["company_finance_receipts"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "company_finance_receipts_transaction_id_fkey";
            columns: ["transaction_id"];
            isOneToOne: false;
            referencedRelation: "company_finance_transactions";
            referencedColumns: ["id"];
          },
        ];
      };
      company_checklist_items: {
        Row: {
          id: string;
          section: string;
          title: string;
          description: string | null;
          priority: string | null;
          status: string | null;
          owner: string | null;
          due_date: string | null;
          estimated_cost: string | null;
          notes: string | null;
          completed: boolean;
          linked_document_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          section: string;
          title: string;
          description?: string | null;
          priority?: string | null;
          status?: string | null;
          owner?: string | null;
          due_date?: string | null;
          estimated_cost?: string | null;
          notes?: string | null;
          completed?: boolean;
          linked_document_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["company_checklist_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "company_checklist_items_linked_document_id_fkey";
            columns: ["linked_document_id"];
            isOneToOne: false;
            referencedRelation: "company_documents";
            referencedColumns: ["id"];
          },
        ];
      };
      company_documents: {
        Row: {
          id: string;
          title: string;
          category: string;
          document_number: string | null;
          checklist_item_id: string | null;
          requirement_id: string | null;
          client_id: string | null;
          record_type: string | null;
          lifecycle_stage: string | null;
          file_path: string | null;
          file_name: string | null;
          file_type: string | null;
          status: string | null;
          owner: string | null;
          revision: string | null;
          notes: string | null;
          effective_date: string | null;
          executed_date: string | null;
          expiration_date: string | null;
          renewal_date: string | null;
          legal_hold: boolean;
          uploaded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          category: string;
          document_number?: string | null;
          checklist_item_id?: string | null;
          requirement_id?: string | null;
          client_id?: string | null;
          record_type?: string | null;
          lifecycle_stage?: string | null;
          file_path?: string | null;
          file_name?: string | null;
          file_type?: string | null;
          status?: string | null;
          owner?: string | null;
          revision?: string | null;
          notes?: string | null;
          effective_date?: string | null;
          executed_date?: string | null;
          expiration_date?: string | null;
          renewal_date?: string | null;
          legal_hold?: boolean;
          uploaded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["company_documents"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "company_documents_checklist_item_id_fkey";
            columns: ["checklist_item_id"];
            isOneToOne: false;
            referencedRelation: "company_checklist_items";
            referencedColumns: ["id"];
          },
        ];
      };
      company_clients: {
        Row: {
          id: string;
          name: string;
          contact_name: string | null;
          email: string | null;
          phone: string | null;
          company_type: string | null;
          lifecycle_stage: string;
          status: string;
          owner: string | null;
          source: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          contact_name?: string | null;
          email?: string | null;
          phone?: string | null;
          company_type?: string | null;
          lifecycle_stage?: string;
          status?: string;
          owner?: string | null;
          source?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["company_clients"]["Insert"]>;
        Relationships: [];
      };
      company_sales_activities: {
        Row: {
          id: string;
          client_id: string;
          activity_type: string;
          title: string;
          notes: string | null;
          activity_date: string | null;
          owner: string | null;
          outcome: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          activity_type?: string;
          title: string;
          notes?: string | null;
          activity_date?: string | null;
          owner?: string | null;
          outcome?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["company_sales_activities"]["Insert"]>;
        Relationships: [];
      };
      company_document_requirements: {
        Row: {
          id: string;
          title: string;
          category: string;
          lifecycle_stage: string;
          required_for_active: boolean;
          description: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          category: string;
          lifecycle_stage: string;
          required_for_active?: boolean;
          description?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["company_document_requirements"]["Insert"]>;
        Relationships: [];
      };
      training_modules: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          category: string;
          audience: string;
          status: string;
          owner: string | null;
          estimated_duration_minutes: number | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          category?: string;
          audience?: string;
          status?: string;
          owner?: string | null;
          estimated_duration_minutes?: number | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["training_modules"]["Insert"]>;
        Relationships: [];
      };
      training_module_files: {
        Row: {
          id: string;
          module_id: string;
          file_bucket: string;
          file_path: string;
          file_name: string;
          file_type: string | null;
          file_size: number | null;
          uploaded_by: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          module_id: string;
          file_bucket?: string;
          file_path: string;
          file_name: string;
          file_type?: string | null;
          file_size?: number | null;
          uploaded_by?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["training_module_files"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "training_module_files_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "training_modules";
            referencedColumns: ["id"];
          },
        ];
      };
      client_training_events: {
        Row: {
          id: string;
          client_id: string;
          title: string;
          scheduled_start_at: string | null;
          delivery_mode: string;
          location: string | null;
          instructor: string | null;
          status: string;
          notes: string | null;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          title: string;
          scheduled_start_at?: string | null;
          delivery_mode?: string;
          location?: string | null;
          instructor?: string | null;
          status?: string;
          notes?: string | null;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["client_training_events"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "client_training_events_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "company_clients";
            referencedColumns: ["id"];
          },
        ];
      };
      client_training_event_modules: {
        Row: {
          id: string;
          event_id: string;
          module_id: string;
          sort_order: number;
          presenter_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          event_id: string;
          module_id: string;
          sort_order?: number;
          presenter_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["client_training_event_modules"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "client_training_event_modules_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "client_training_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "client_training_event_modules_module_id_fkey";
            columns: ["module_id"];
            isOneToOne: false;
            referencedRelation: "training_modules";
            referencedColumns: ["id"];
          },
        ];
      };
      client_onboarding_items: {
        Row: {
          id: string;
          client_id: string;
          title: string;
          section: string;
          lifecycle_stage: string;
          status: string;
          owner: string | null;
          due_date: string | null;
          completed: boolean;
          linked_document_id: string | null;
          notes: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          title: string;
          section: string;
          lifecycle_stage: string;
          status?: string;
          owner?: string | null;
          due_date?: string | null;
          completed?: boolean;
          linked_document_id?: string | null;
          notes?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["client_onboarding_items"]["Insert"]>;
        Relationships: [];
      };
      company_legal_issues: {
        Row: {
          id: string;
          title: string;
          severity: string;
          status: string;
          owner: string | null;
          due_date: string | null;
          client_id: string | null;
          linked_document_id: string | null;
          description: string | null;
          resolution_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          severity?: string;
          status?: string;
          owner?: string | null;
          due_date?: string | null;
          client_id?: string | null;
          linked_document_id?: string | null;
          description?: string | null;
          resolution_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["company_legal_issues"]["Insert"]>;
        Relationships: [];
      };
      company_operations_records: {
        Row: {
          id: string;
          title: string;
          category: string;
          record_type: string;
          status: string;
          priority: string;
          owner: string | null;
          due_date: string | null;
          description: string | null;
          notes: string | null;
          related_client_id: string | null;
          related_document_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          category?: string;
          record_type?: string;
          status?: string;
          priority?: string;
          owner?: string | null;
          due_date?: string | null;
          description?: string | null;
          notes?: string | null;
          related_client_id?: string | null;
          related_document_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["company_operations_records"]["Insert"]>;
        Relationships: [];
      };
      company_positions: {
        Row: {
          id: string;
          title: string;
          department: string;
          parent_position_id: string | null;
          status: string;
          portal_user_id: string | null;
          job_description: string | null;
          salary_min: number | null;
          salary_max: number | null;
          salary_period: string | null;
          employment_type: string | null;
          location: string | null;
          hiring_priority: string | null;
          sort_order: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          department?: string;
          parent_position_id?: string | null;
          status?: string;
          portal_user_id?: string | null;
          job_description?: string | null;
          salary_min?: number | null;
          salary_max?: number | null;
          salary_period?: string | null;
          employment_type?: string | null;
          location?: string | null;
          hiring_priority?: string | null;
          sort_order?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["company_positions"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "company_positions_parent_position_id_fkey";
            columns: ["parent_position_id"];
            isOneToOne: false;
            referencedRelation: "company_positions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "company_positions_portal_user_id_fkey";
            columns: ["portal_user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_chat_profiles: {
        Row: {
          user_id: string;
          display_name: string | null;
          email: string | null;
          role: string;
          team: string | null;
          account_status: string;
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          display_name?: string | null;
          email?: string | null;
          role?: string;
          team?: string | null;
          account_status?: string;
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_chat_profiles"]["Insert"]>;
        Relationships: [];
      };
      employee_chat_threads: {
        Row: {
          id: string;
          thread_type: string;
          title: string | null;
          participant_one_user_id: string | null;
          participant_two_user_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          thread_type: string;
          title?: string | null;
          participant_one_user_id?: string | null;
          participant_two_user_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_chat_threads"]["Insert"]>;
        Relationships: [];
      };
      employee_chat_messages: {
        Row: {
          id: string;
          thread_id: string;
          sender_user_id: string | null;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          thread_id: string;
          sender_user_id?: string | null;
          body: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_chat_messages"]["Insert"]>;
        Relationships: [];
      };
      employee_profiles: {
        Row: {
          user_id: string;
          legal_name: string | null;
          display_name: string | null;
          email: string | null;
          profile_status: string;
          time_card_role_id: string | null;
          work_state: string | null;
          phone: string | null;
          emergency_contact_name: string | null;
          emergency_contact_phone: string | null;
          emergency_contact_relationship: string | null;
          onboarding_status: string;
          onboarding_completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          legal_name?: string | null;
          display_name?: string | null;
          email?: string | null;
          profile_status?: string;
          time_card_role_id?: string | null;
          work_state?: string | null;
          phone?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_phone?: string | null;
          emergency_contact_relationship?: string | null;
          onboarding_status?: string;
          onboarding_completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_profiles"]["Insert"]>;
        Relationships: [];
      };
      employee_expense_reports: {
        Row: {
          id: string;
          employee_user_id: string;
          title: string;
          category: string;
          amount: number;
          expense_date: string;
          merchant: string | null;
          payment_method: string | null;
          business_purpose: string;
          notes: string | null;
          status: string;
          finance_notes: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          reimbursed_by: string | null;
          reimbursed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          employee_user_id: string;
          title: string;
          category: string;
          amount: number;
          expense_date?: string;
          merchant?: string | null;
          payment_method?: string | null;
          business_purpose: string;
          notes?: string | null;
          status?: string;
          finance_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          reimbursed_by?: string | null;
          reimbursed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_expense_reports"]["Insert"]>;
        Relationships: [];
      };
      employee_expense_receipts: {
        Row: {
          id: string;
          expense_report_id: string;
          file_path: string;
          file_name: string;
          file_type: string | null;
          file_size: number | null;
          uploaded_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          expense_report_id: string;
          file_path: string;
          file_name: string;
          file_type?: string | null;
          file_size?: number | null;
          uploaded_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_expense_receipts"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "employee_expense_receipts_expense_report_id_fkey";
            columns: ["expense_report_id"];
            isOneToOne: false;
            referencedRelation: "employee_expense_reports";
            referencedColumns: ["id"];
          },
        ];
      };
      hr_compliance_requirements: {
        Row: {
          id: string;
          slug: string;
          title: string;
          jurisdiction_level: string;
          jurisdiction_state: string | null;
          employee_type: string;
          category: string;
          document_mode: string;
          official_source_url: string | null;
          due_rule: string | null;
          retention_rule: string | null;
          review_status: string;
          active: boolean;
          required: boolean;
          sort_order: number;
          last_reviewed_at: string | null;
          reviewed_by: string | null;
          review_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          title: string;
          jurisdiction_level?: string;
          jurisdiction_state?: string | null;
          employee_type?: string;
          category?: string;
          document_mode?: string;
          official_source_url?: string | null;
          due_rule?: string | null;
          retention_rule?: string | null;
          review_status?: string;
          active?: boolean;
          required?: boolean;
          sort_order?: number;
          last_reviewed_at?: string | null;
          reviewed_by?: string | null;
          review_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["hr_compliance_requirements"]["Insert"]>;
        Relationships: [];
      };
      hr_document_templates: {
        Row: {
          id: string;
          title: string;
          category: string;
          body_text: string;
          version: number;
          active: boolean;
          required: boolean;
          sort_order: number;
          source_document_id: string | null;
          form_definition_id: string | null;
          compliance_requirement_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          category?: string;
          body_text: string;
          version?: number;
          active?: boolean;
          required?: boolean;
          sort_order?: number;
          source_document_id?: string | null;
          form_definition_id?: string | null;
          compliance_requirement_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["hr_document_templates"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "hr_document_templates_source_document_id_fkey";
            columns: ["source_document_id"];
            isOneToOne: false;
            referencedRelation: "company_documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hr_document_templates_form_definition_id_fkey";
            columns: ["form_definition_id"];
            isOneToOne: false;
            referencedRelation: "hr_form_definitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hr_document_templates_compliance_requirement_id_fkey";
            columns: ["compliance_requirement_id"];
            isOneToOne: false;
            referencedRelation: "hr_compliance_requirements";
            referencedColumns: ["id"];
          },
        ];
      };
      hr_form_definitions: {
        Row: {
          id: string;
          slug: string;
          title: string;
          category: string;
          description: string | null;
          jurisdiction_type: string;
          jurisdiction_code: string;
          applies_to_state: string | null;
          form_source_url: string | null;
          official_form_name: string | null;
          official_form_edition: string | null;
          official_form_expiration_date: string | null;
          field_schema: Json;
          compliance_requirement_id: string | null;
          active: boolean;
          required: boolean;
          sensitive: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          title: string;
          category?: string;
          description?: string | null;
          jurisdiction_type?: string;
          jurisdiction_code?: string;
          applies_to_state?: string | null;
          form_source_url?: string | null;
          official_form_name?: string | null;
          official_form_edition?: string | null;
          official_form_expiration_date?: string | null;
          field_schema?: Json;
          compliance_requirement_id?: string | null;
          active?: boolean;
          required?: boolean;
          sensitive?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["hr_form_definitions"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "hr_form_definitions_compliance_requirement_id_fkey";
            columns: ["compliance_requirement_id"];
            isOneToOne: false;
            referencedRelation: "hr_compliance_requirements";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_form_responses: {
        Row: {
          id: string;
          assignment_id: string;
          user_id: string;
          template_id: string;
          form_definition_id: string;
          status: string;
          answers: Json;
          form_version: number;
          form_snapshot: Json;
          signed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          assignment_id: string;
          user_id: string;
          template_id: string;
          form_definition_id: string;
          status?: string;
          answers?: Json;
          form_version: number;
          form_snapshot: Json;
          signed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_form_responses"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "employee_form_responses_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: true;
            referencedRelation: "employee_document_assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_form_responses_form_definition_id_fkey";
            columns: ["form_definition_id"];
            isOneToOne: false;
            referencedRelation: "hr_form_definitions";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_signed_documents: {
        Row: {
          id: string;
          assignment_id: string;
          response_id: string;
          user_id: string;
          template_id: string;
          form_definition_id: string;
          file_bucket: string;
          file_path: string;
          file_name: string;
          file_type: string;
          file_sha256: string;
          form_snapshot: Json;
          answer_snapshot: Json;
          typed_legal_name: string;
          signer_email: string | null;
          signer_ip: string | null;
          signer_user_agent: string | null;
          signed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          assignment_id: string;
          response_id: string;
          user_id: string;
          template_id: string;
          form_definition_id: string;
          file_bucket?: string;
          file_path: string;
          file_name: string;
          file_type?: string;
          file_sha256: string;
          form_snapshot: Json;
          answer_snapshot: Json;
          typed_legal_name: string;
          signer_email?: string | null;
          signer_ip?: string | null;
          signer_user_agent?: string | null;
          signed_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_signed_documents"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "employee_signed_documents_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: true;
            referencedRelation: "employee_document_assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_signed_documents_response_id_fkey";
            columns: ["response_id"];
            isOneToOne: false;
            referencedRelation: "employee_form_responses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_signed_documents_form_definition_id_fkey";
            columns: ["form_definition_id"];
            isOneToOne: false;
            referencedRelation: "hr_form_definitions";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_onboarding_uploads: {
        Row: {
          id: string;
          assignment_id: string;
          user_id: string;
          template_id: string;
          compliance_requirement_id: string | null;
          file_bucket: string;
          file_path: string;
          file_name: string;
          file_type: string;
          file_size: number;
          file_sha256: string;
          upload_status: string;
          review_notes: string | null;
          reviewed_by: string | null;
          reviewed_at: string | null;
          superseded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          assignment_id: string;
          user_id: string;
          template_id: string;
          compliance_requirement_id?: string | null;
          file_bucket?: string;
          file_path: string;
          file_name: string;
          file_type: string;
          file_size: number;
          file_sha256: string;
          upload_status?: string;
          review_notes?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          superseded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_onboarding_uploads"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "employee_onboarding_uploads_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "employee_document_assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_onboarding_uploads_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "hr_document_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_onboarding_uploads_compliance_requirement_id_fkey";
            columns: ["compliance_requirement_id"];
            isOneToOne: false;
            referencedRelation: "hr_compliance_requirements";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_onboarding_audit_events: {
        Row: {
          id: string;
          assignment_id: string | null;
          user_id: string | null;
          actor_user_id: string | null;
          event_type: string;
          event_details: Json;
          signer_ip: string | null;
          signer_user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          assignment_id?: string | null;
          user_id?: string | null;
          actor_user_id?: string | null;
          event_type: string;
          event_details?: Json;
          signer_ip?: string | null;
          signer_user_agent?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_onboarding_audit_events"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "employee_onboarding_audit_events_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: false;
            referencedRelation: "employee_document_assignments";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_document_assignments: {
        Row: {
          id: string;
          user_id: string;
          template_id: string;
          status: string;
          due_date: string | null;
          assigned_by: string | null;
          existing_document_id: string | null;
          compliance_requirement_id: string | null;
          verification_status: string;
          verified_by: string | null;
          verified_at: string | null;
          rejection_reason: string | null;
          retention_until: string | null;
          legal_hold: boolean;
          signed_at: string | null;
          waived_at: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          template_id: string;
          status?: string;
          due_date?: string | null;
          assigned_by?: string | null;
          existing_document_id?: string | null;
          compliance_requirement_id?: string | null;
          verification_status?: string;
          verified_by?: string | null;
          verified_at?: string | null;
          rejection_reason?: string | null;
          retention_until?: string | null;
          legal_hold?: boolean;
          signed_at?: string | null;
          waived_at?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_document_assignments"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "employee_document_assignments_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "hr_document_templates";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_document_assignments_existing_document_id_fkey";
            columns: ["existing_document_id"];
            isOneToOne: false;
            referencedRelation: "company_documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_document_assignments_compliance_requirement_id_fkey";
            columns: ["compliance_requirement_id"];
            isOneToOne: false;
            referencedRelation: "hr_compliance_requirements";
            referencedColumns: ["id"];
          },
        ];
      };
      employee_document_signatures: {
        Row: {
          id: string;
          assignment_id: string;
          user_id: string;
          template_id: string;
          template_version: number;
          document_title: string;
          document_body: string;
          source_document_id: string | null;
          source_file_path: string | null;
          typed_legal_name: string;
          consented: boolean;
          signer_email: string | null;
          signer_ip: string | null;
          signer_user_agent: string | null;
          signed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          assignment_id: string;
          user_id: string;
          template_id: string;
          template_version: number;
          document_title: string;
          document_body: string;
          source_document_id?: string | null;
          source_file_path?: string | null;
          typed_legal_name: string;
          consented?: boolean;
          signer_email?: string | null;
          signer_ip?: string | null;
          signer_user_agent?: string | null;
          signed_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employee_document_signatures"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "employee_document_signatures_assignment_id_fkey";
            columns: ["assignment_id"];
            isOneToOne: true;
            referencedRelation: "employee_document_assignments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employee_document_signatures_template_id_fkey";
            columns: ["template_id"];
            isOneToOne: false;
            referencedRelation: "hr_document_templates";
            referencedColumns: ["id"];
          },
        ];
      };
      demo_requests: {
        Row: {
          id: string;
          name: string;
          company: string | null;
          email: string;
          phone: string | null;
          role: string | null;
          company_type: string | null;
          interested_products: string[] | null;
          message: string | null;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          company?: string | null;
          email: string;
          phone?: string | null;
          role?: string | null;
          company_type?: string | null;
          interested_products?: string[] | null;
          message?: string | null;
          status?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["demo_requests"]["Insert"]>;
        Relationships: [];
      };
      user_roles: {
        Row: {
          user_id: string;
          role: string;
          team: string | null;
          account_status: string;
          company_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          role?: string;
          team?: string | null;
          account_status?: string;
          company_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["user_roles"]["Insert"]>;
        Relationships: [];
      };
      portal_user_module_access: {
        Row: {
          user_id: string;
          module_key: string;
          granted_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          module_key: string;
          granted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["portal_user_module_access"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: {
      company_position_employee_directory: {
        Row: {
          position_id: string;
          user_id: string;
          display_name: string | null;
          legal_name: string | null;
          email: string | null;
          phone: string | null;
          profile_status: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "company_positions_portal_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      is_company_portal_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_company_portal_employee: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_company_finance_user: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_company_portal_owner: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_company_portal_super_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      mark_employee_last_seen: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
