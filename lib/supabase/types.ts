export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
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
          employee_name: string | null;
          employee_email: string | null;
          employee_phone: string | null;
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
          employee_name?: string | null;
          employee_email?: string | null;
          employee_phone?: string | null;
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
    };
    Views: Record<string, never>;
    Functions: {
      is_company_portal_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_company_portal_employee: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_company_portal_owner: {
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
