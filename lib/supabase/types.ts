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
      ai_digest_runs: {
        Row: {
          created_at: string | null
          digest_date: string
          email_to: string | null
          error_message: string | null
          id: string
          notification_count: number
          resend_email_id: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          digest_date: string
          email_to?: string | null
          error_message?: string | null
          id?: string
          notification_count?: number
          resend_email_id?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          digest_date?: string
          email_to?: string | null
          error_message?: string | null
          id?: string
          notification_count?: number
          resend_email_id?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_feedback_entries: {
        Row: {
          corrected_output: string | null
          feedback_type: string
          gateway_log_id: string | null
          id: string
          included_in_retrain: boolean | null
          notes: string | null
          original_output: string | null
          prompt_key: string | null
          rejection_reason: string | null
          submitted_at: string | null
          submitted_by: string | null
        }
        Insert: {
          corrected_output?: string | null
          feedback_type: string
          gateway_log_id?: string | null
          id?: string
          included_in_retrain?: boolean | null
          notes?: string | null
          original_output?: string | null
          prompt_key?: string | null
          rejection_reason?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
        }
        Update: {
          corrected_output?: string | null
          feedback_type?: string
          gateway_log_id?: string | null
          id?: string
          included_in_retrain?: boolean | null
          notes?: string | null
          original_output?: string | null
          prompt_key?: string | null
          rejection_reason?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_feedback_entries_gateway_log_id_fkey"
            columns: ["gateway_log_id"]
            isOneToOne: false
            referencedRelation: "ai_gateway_log"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_gateway_log: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          human_reviewed_at: string | null
          human_reviewed_by: string | null
          human_verdict: string | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model_used: string | null
          output_summary: string | null
          output_tokens: number | null
          prompt_key: string | null
          request_id: string
          required_human_review: boolean | null
          validation_checks: Json | null
          validation_status: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          human_reviewed_at?: string | null
          human_reviewed_by?: string | null
          human_verdict?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model_used?: string | null
          output_summary?: string | null
          output_tokens?: number | null
          prompt_key?: string | null
          request_id: string
          required_human_review?: boolean | null
          validation_checks?: Json | null
          validation_status?: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          human_reviewed_at?: string | null
          human_reviewed_by?: string | null
          human_verdict?: string | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model_used?: string | null
          output_summary?: string | null
          output_tokens?: number | null
          prompt_key?: string | null
          request_id?: string
          required_human_review?: boolean | null
          validation_checks?: Json | null
          validation_status?: string
        }
        Relationships: []
      }
      ai_model_registry: {
        Row: {
          accuracy_score: number | null
          created_at: string | null
          description: string | null
          f1_score: number | null
          fallback_model_key: string | null
          id: string
          last_evaluated_at: string | null
          model_id: string
          model_key: string
          model_type: string
          name: string
          notes: string | null
          provider: string
          retrain_trigger_threshold: number | null
          status: string
          updated_at: string | null
          version: string
        }
        Insert: {
          accuracy_score?: number | null
          created_at?: string | null
          description?: string | null
          f1_score?: number | null
          fallback_model_key?: string | null
          id?: string
          last_evaluated_at?: string | null
          model_id: string
          model_key: string
          model_type?: string
          name: string
          notes?: string | null
          provider?: string
          retrain_trigger_threshold?: number | null
          status?: string
          updated_at?: string | null
          version?: string
        }
        Update: {
          accuracy_score?: number | null
          created_at?: string | null
          description?: string | null
          f1_score?: number | null
          fallback_model_key?: string | null
          id?: string
          last_evaluated_at?: string | null
          model_id?: string
          model_key?: string
          model_type?: string
          name?: string
          notes?: string | null
          provider?: string
          retrain_trigger_threshold?: number | null
          status?: string
          updated_at?: string | null
          version?: string
        }
        Relationships: []
      }
      ai_prompt_templates: {
        Row: {
          category: string
          confidence_threshold: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          max_tokens: number | null
          model_hint: string | null
          name: string
          prompt_key: string
          requires_human_review: boolean | null
          temperature: number | null
          template_text: string
          test_scenario_count: number | null
          updated_at: string | null
          version: string
        }
        Insert: {
          category?: string
          confidence_threshold?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_tokens?: number | null
          model_hint?: string | null
          name: string
          prompt_key: string
          requires_human_review?: boolean | null
          temperature?: number | null
          template_text: string
          test_scenario_count?: number | null
          updated_at?: string | null
          version?: string
        }
        Update: {
          category?: string
          confidence_threshold?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_tokens?: number | null
          model_hint?: string | null
          name?: string
          prompt_key?: string
          requires_human_review?: boolean | null
          temperature?: number | null
          template_text?: string
          test_scenario_count?: number | null
          updated_at?: string | null
          version?: string
        }
        Relationships: []
      }
      ai_prompt_versions: {
        Row: {
          change_summary: string | null
          created_at: string | null
          created_by: string | null
          id: string
          prompt_template_id: string | null
          template_text: string
          version: string
        }
        Insert: {
          change_summary?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          prompt_template_id?: string | null
          template_text: string
          version: string
        }
        Update: {
          change_summary?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          prompt_template_id?: string | null
          template_text?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_prompt_versions_prompt_template_id_fkey"
            columns: ["prompt_template_id"]
            isOneToOne: false
            referencedRelation: "ai_prompt_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      brainstorming_parking_lot_cards: {
        Row: {
          archived_at: string | null
          archived_by_user_id: string | null
          category_id: string
          created_at: string | null
          created_by_user_id: string | null
          description: string
          id: string
          is_placeholder: boolean
          lane: string
          notes: string
          owner: string | null
          placeholder_slot: number | null
          priority: string
          sort_order: number
          title: string
          updated_at: string | null
          updated_by_user_id: string | null
        }
        Insert: {
          archived_at?: string | null
          archived_by_user_id?: string | null
          category_id: string
          created_at?: string | null
          created_by_user_id?: string | null
          description?: string
          id?: string
          is_placeholder?: boolean
          lane?: string
          notes?: string
          owner?: string | null
          placeholder_slot?: number | null
          priority?: string
          sort_order?: number
          title: string
          updated_at?: string | null
          updated_by_user_id?: string | null
        }
        Update: {
          archived_at?: string | null
          archived_by_user_id?: string | null
          category_id?: string
          created_at?: string | null
          created_by_user_id?: string | null
          description?: string
          id?: string
          is_placeholder?: boolean
          lane?: string
          notes?: string
          owner?: string | null
          placeholder_slot?: number | null
          priority?: string
          sort_order?: number
          title?: string
          updated_at?: string | null
          updated_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brainstorming_parking_lot_cards_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "brainstorming_parking_lot_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      brainstorming_parking_lot_categories: {
        Row: {
          created_at: string | null
          description: string
          id: string
          slug: string
          sort_order: number
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string
          id?: string
          slug: string
          sort_order?: number
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string
          id?: string
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      client_onboarding_items: {
        Row: {
          client_id: string
          completed: boolean | null
          created_at: string | null
          due_date: string | null
          id: string
          lifecycle_stage: string
          linked_document_id: string | null
          notes: string | null
          owner: string | null
          section: string
          sort_order: number | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          client_id: string
          completed?: boolean | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          lifecycle_stage: string
          linked_document_id?: string | null
          notes?: string | null
          owner?: string | null
          section: string
          sort_order?: number | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          completed?: boolean | null
          created_at?: string | null
          due_date?: string | null
          id?: string
          lifecycle_stage?: string
          linked_document_id?: string | null
          notes?: string | null
          owner?: string | null
          section?: string
          sort_order?: number | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_onboarding_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_onboarding_items_linked_document_id_fkey"
            columns: ["linked_document_id"]
            isOneToOne: false
            referencedRelation: "company_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      client_training_event_modules: {
        Row: {
          created_at: string | null
          event_id: string
          id: string
          module_id: string
          presenter_notes: string | null
          sort_order: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          event_id: string
          id?: string
          module_id: string
          presenter_notes?: string | null
          sort_order?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          event_id?: string
          id?: string
          module_id?: string
          presenter_notes?: string | null
          sort_order?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_training_event_modules_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "client_training_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_training_event_modules_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      client_training_events: {
        Row: {
          client_id: string
          created_at: string | null
          created_by: string | null
          delivery_mode: string
          id: string
          instructor: string | null
          location: string | null
          notes: string | null
          scheduled_start_at: string | null
          status: string
          title: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          created_by?: string | null
          delivery_mode?: string
          id?: string
          instructor?: string | null
          location?: string | null
          notes?: string | null
          scheduled_start_at?: string | null
          status?: string
          title: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          created_by?: string | null
          delivery_mode?: string
          id?: string
          instructor?: string | null
          location?: string | null
          notes?: string | null
          scheduled_start_at?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_training_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      company_checklist_items: {
        Row: {
          completed: boolean | null
          created_at: string | null
          description: string | null
          due_date: string | null
          estimated_cost: string | null
          id: string
          linked_document_id: string | null
          notes: string | null
          owner: string | null
          priority: string | null
          section: string
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          completed?: boolean | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          estimated_cost?: string | null
          id?: string
          linked_document_id?: string | null
          notes?: string | null
          owner?: string | null
          priority?: string | null
          section: string
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          completed?: boolean | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          estimated_cost?: string | null
          id?: string
          linked_document_id?: string | null
          notes?: string | null
          owner?: string | null
          priority?: string | null
          section?: string
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_checklist_items_linked_document_id_fkey"
            columns: ["linked_document_id"]
            isOneToOne: false
            referencedRelation: "company_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      company_clients: {
        Row: {
          company_type: string | null
          contact_name: string | null
          created_at: string | null
          email: string | null
          id: string
          lifecycle_stage: string
          name: string
          notes: string | null
          owner: string | null
          phone: string | null
          source: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          company_type?: string | null
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          lifecycle_stage?: string
          name: string
          notes?: string | null
          owner?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          company_type?: string | null
          contact_name?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          lifecycle_stage?: string
          name?: string
          notes?: string | null
          owner?: string | null
          phone?: string | null
          source?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      company_document_requirements: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          id: string
          lifecycle_stage: string
          required_for_active: boolean | null
          sort_order: number | null
          title: string
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          id?: string
          lifecycle_stage: string
          required_for_active?: boolean | null
          sort_order?: number | null
          title: string
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          id?: string
          lifecycle_stage?: string
          required_for_active?: boolean | null
          sort_order?: number | null
          title?: string
        }
        Relationships: []
      }
      company_documents: {
        Row: {
          category: string
          checklist_item_id: string | null
          client_id: string | null
          created_at: string | null
          document_number: string | null
          effective_date: string | null
          executed_date: string | null
          expiration_date: string | null
          file_name: string | null
          file_path: string | null
          file_type: string | null
          id: string
          legal_hold: boolean | null
          lifecycle_stage: string | null
          notes: string | null
          owner: string | null
          record_type: string | null
          renewal_date: string | null
          requirement_id: string | null
          revision: string | null
          status: string | null
          title: string
          updated_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          category: string
          checklist_item_id?: string | null
          client_id?: string | null
          created_at?: string | null
          document_number?: string | null
          effective_date?: string | null
          executed_date?: string | null
          expiration_date?: string | null
          file_name?: string | null
          file_path?: string | null
          file_type?: string | null
          id?: string
          legal_hold?: boolean | null
          lifecycle_stage?: string | null
          notes?: string | null
          owner?: string | null
          record_type?: string | null
          renewal_date?: string | null
          requirement_id?: string | null
          revision?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          checklist_item_id?: string | null
          client_id?: string | null
          created_at?: string | null
          document_number?: string | null
          effective_date?: string | null
          executed_date?: string | null
          expiration_date?: string | null
          file_name?: string | null
          file_path?: string | null
          file_type?: string | null
          id?: string
          legal_hold?: boolean | null
          lifecycle_stage?: string | null
          notes?: string | null
          owner?: string | null
          record_type?: string | null
          renewal_date?: string | null
          requirement_id?: string | null
          revision?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_documents_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "company_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_documents_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "company_document_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      company_finance_authorized_users: {
        Row: {
          access_label: string | null
          created_at: string | null
          created_by: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_label?: string | null
          created_at?: string | null
          created_by?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_label?: string | null
          created_at?: string | null
          created_by?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      company_finance_budgets: {
        Row: {
          amount: number
          budget_type: string
          category: string
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          notes: string | null
          owner: string | null
          period: string
          period_start: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          budget_type: string
          category: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          owner?: string | null
          period?: string
          period_start: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          budget_type?: string
          category?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner?: string | null
          period?: string
          period_start?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      company_finance_receipts: {
        Row: {
          created_at: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          transaction_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          transaction_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          transaction_id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_finance_receipts_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "company_finance_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      company_finance_recurring_items: {
        Row: {
          amount: number
          cadence: string
          category: string
          created_at: string | null
          created_by: string | null
          id: string
          item_type: string
          next_due_date: string | null
          notes: string | null
          owner: string | null
          payment_method: string | null
          status: string
          title: string
          updated_at: string | null
          vendor_customer: string | null
        }
        Insert: {
          amount: number
          cadence?: string
          category: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          item_type: string
          next_due_date?: string | null
          notes?: string | null
          owner?: string | null
          payment_method?: string | null
          status?: string
          title: string
          updated_at?: string | null
          vendor_customer?: string | null
        }
        Update: {
          amount?: number
          cadence?: string
          category?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          item_type?: string
          next_due_date?: string | null
          notes?: string | null
          owner?: string | null
          payment_method?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          vendor_customer?: string | null
        }
        Relationships: []
      }
      company_finance_transactions: {
        Row: {
          amount: number
          category: string
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          owner: string | null
          payment_method: string | null
          related_client_id: string | null
          related_document_id: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          title: string
          transaction_date: string
          transaction_type: string
          updated_at: string | null
          vendor_customer: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          owner?: string | null
          payment_method?: string | null
          related_client_id?: string | null
          related_document_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status: string
          title: string
          transaction_date?: string
          transaction_type: string
          updated_at?: string | null
          vendor_customer?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          owner?: string | null
          payment_method?: string | null
          related_client_id?: string | null
          related_document_id?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          title?: string
          transaction_date?: string
          transaction_type?: string
          updated_at?: string | null
          vendor_customer?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_finance_transactions_related_client_id_fkey"
            columns: ["related_client_id"]
            isOneToOne: false
            referencedRelation: "company_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_finance_transactions_related_document_id_fkey"
            columns: ["related_document_id"]
            isOneToOne: false
            referencedRelation: "company_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      company_legal_issues: {
        Row: {
          client_id: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          linked_document_id: string | null
          owner: string | null
          resolution_notes: string | null
          severity: string
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          linked_document_id?: string | null
          owner?: string | null
          resolution_notes?: string | null
          severity?: string
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          linked_document_id?: string | null
          owner?: string | null
          resolution_notes?: string | null
          severity?: string
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_legal_issues_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_legal_issues_linked_document_id_fkey"
            columns: ["linked_document_id"]
            isOneToOne: false
            referencedRelation: "company_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      company_operations_records: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          notes: string | null
          owner: string | null
          priority: string
          record_type: string
          related_client_id: string | null
          related_document_id: string | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          owner?: string | null
          priority?: string
          record_type?: string
          related_client_id?: string | null
          related_document_id?: string | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          notes?: string | null
          owner?: string | null
          priority?: string
          record_type?: string
          related_client_id?: string | null
          related_document_id?: string | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_operations_records_related_client_id_fkey"
            columns: ["related_client_id"]
            isOneToOne: false
            referencedRelation: "company_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_operations_records_related_document_id_fkey"
            columns: ["related_document_id"]
            isOneToOne: false
            referencedRelation: "company_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      company_positions: {
        Row: {
          created_at: string | null
          department: string
          employment_type: string | null
          hiring_priority: string | null
          id: string
          job_description: string | null
          location: string | null
          notes: string | null
          parent_position_id: string | null
          portal_user_id: string | null
          salary_max: number | null
          salary_min: number | null
          salary_period: string | null
          sort_order: number
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          department?: string
          employment_type?: string | null
          hiring_priority?: string | null
          id?: string
          job_description?: string | null
          location?: string | null
          notes?: string | null
          parent_position_id?: string | null
          portal_user_id?: string | null
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          sort_order?: number
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          department?: string
          employment_type?: string | null
          hiring_priority?: string | null
          id?: string
          job_description?: string | null
          location?: string | null
          notes?: string | null
          parent_position_id?: string | null
          portal_user_id?: string | null
          salary_max?: number | null
          salary_min?: number | null
          salary_period?: string | null
          sort_order?: number
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_positions_parent_position_id_fkey"
            columns: ["parent_position_id"]
            isOneToOne: false
            referencedRelation: "company_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      company_sales_activities: {
        Row: {
          activity_date: string | null
          activity_type: string
          client_id: string
          created_at: string | null
          id: string
          notes: string | null
          outcome: string | null
          owner: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          activity_date?: string | null
          activity_type?: string
          client_id: string
          created_at?: string | null
          id?: string
          notes?: string | null
          outcome?: string | null
          owner?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          activity_date?: string | null
          activity_type?: string
          client_id?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          outcome?: string | null
          owner?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_sales_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_requests: {
        Row: {
          company: string | null
          company_type: string | null
          created_at: string | null
          email: string
          id: string
          interested_products: string[] | null
          message: string | null
          name: string
          phone: string | null
          role: string | null
          status: string | null
        }
        Insert: {
          company?: string | null
          company_type?: string | null
          created_at?: string | null
          email: string
          id?: string
          interested_products?: string[] | null
          message?: string | null
          name: string
          phone?: string | null
          role?: string | null
          status?: string | null
        }
        Update: {
          company?: string | null
          company_type?: string | null
          created_at?: string | null
          email?: string
          id?: string
          interested_products?: string[] | null
          message?: string | null
          name?: string
          phone?: string | null
          role?: string | null
          status?: string | null
        }
        Relationships: []
      }
      employee_calendar_event_attendees: {
        Row: {
          created_at: string
          event_id: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_calendar_event_attendees_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "employee_calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_calendar_events: {
        Row: {
          all_day: boolean
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string
          description: string | null
          end_at: string
          event_type: string
          id: string
          location: string | null
          start_at: string
          status: string
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          all_day?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          end_at: string
          event_type?: string
          id?: string
          location?: string | null
          start_at: string
          status?: string
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          all_day?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          end_at?: string
          event_type?: string
          id?: string
          location?: string | null
          start_at?: string
          status?: string
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      employee_chat_call_participants: {
        Row: {
          audio_enabled: boolean
          call_id: string
          created_at: string | null
          id: string
          joined_at: string | null
          left_at: string | null
          screen_sharing: boolean
          status: string
          updated_at: string | null
          user_id: string
          video_enabled: boolean
        }
        Insert: {
          audio_enabled?: boolean
          call_id: string
          created_at?: string | null
          id?: string
          joined_at?: string | null
          left_at?: string | null
          screen_sharing?: boolean
          status?: string
          updated_at?: string | null
          user_id: string
          video_enabled?: boolean
        }
        Update: {
          audio_enabled?: boolean
          call_id?: string
          created_at?: string | null
          id?: string
          joined_at?: string | null
          left_at?: string | null
          screen_sharing?: boolean
          status?: string
          updated_at?: string | null
          user_id?: string
          video_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "employee_chat_call_participants_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "employee_chat_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_chat_calls: {
        Row: {
          created_at: string | null
          created_by: string | null
          ended_at: string | null
          id: string
          started_at: string | null
          status: string
          thread_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          ended_at?: string | null
          id?: string
          started_at?: string | null
          status?: string
          thread_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          ended_at?: string | null
          id?: string
          started_at?: string | null
          status?: string
          thread_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_chat_calls_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "employee_chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_chat_messages: {
        Row: {
          body: string
          created_at: string | null
          id: string
          sender_user_id: string | null
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          sender_user_id?: string | null
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          sender_user_id?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "employee_chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_chat_profiles: {
        Row: {
          account_status: string
          created_at: string | null
          display_name: string | null
          email: string | null
          last_seen_at: string | null
          role: string
          team: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_status?: string
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          last_seen_at?: string | null
          role?: string
          team?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_status?: string
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          last_seen_at?: string | null
          role?: string
          team?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      employee_chat_threads: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          participant_one_user_id: string | null
          participant_two_user_id: string | null
          thread_type: string
          title: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          participant_one_user_id?: string | null
          participant_two_user_id?: string | null
          thread_type: string
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          participant_one_user_id?: string | null
          participant_two_user_id?: string | null
          thread_type?: string
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      employee_document_assignments: {
        Row: {
          assigned_by: string | null
          compliance_requirement_id: string | null
          created_at: string | null
          due_date: string | null
          existing_document_id: string | null
          id: string
          legal_hold: boolean
          notes: string | null
          rejection_reason: string | null
          retention_until: string | null
          signed_at: string | null
          status: string
          template_id: string
          updated_at: string | null
          user_id: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
          waived_at: string | null
        }
        Insert: {
          assigned_by?: string | null
          compliance_requirement_id?: string | null
          created_at?: string | null
          due_date?: string | null
          existing_document_id?: string | null
          id?: string
          legal_hold?: boolean
          notes?: string | null
          rejection_reason?: string | null
          retention_until?: string | null
          signed_at?: string | null
          status?: string
          template_id: string
          updated_at?: string | null
          user_id: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
          waived_at?: string | null
        }
        Update: {
          assigned_by?: string | null
          compliance_requirement_id?: string | null
          created_at?: string | null
          due_date?: string | null
          existing_document_id?: string | null
          id?: string
          legal_hold?: boolean
          notes?: string | null
          rejection_reason?: string | null
          retention_until?: string | null
          signed_at?: string | null
          status?: string
          template_id?: string
          updated_at?: string | null
          user_id?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
          waived_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_document_assignments_compliance_requirement_id_fkey"
            columns: ["compliance_requirement_id"]
            isOneToOne: false
            referencedRelation: "hr_compliance_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_document_assignments_existing_document_id_fkey"
            columns: ["existing_document_id"]
            isOneToOne: false
            referencedRelation: "company_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_document_assignments_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "hr_document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_document_signatures: {
        Row: {
          assignment_id: string
          consented: boolean
          created_at: string | null
          document_body: string
          document_title: string
          id: string
          signed_at: string
          signer_email: string | null
          signer_ip: string | null
          signer_user_agent: string | null
          source_document_id: string | null
          source_file_path: string | null
          template_id: string
          template_version: number
          typed_legal_name: string
          user_id: string
        }
        Insert: {
          assignment_id: string
          consented?: boolean
          created_at?: string | null
          document_body: string
          document_title: string
          id?: string
          signed_at?: string
          signer_email?: string | null
          signer_ip?: string | null
          signer_user_agent?: string | null
          source_document_id?: string | null
          source_file_path?: string | null
          template_id: string
          template_version: number
          typed_legal_name: string
          user_id: string
        }
        Update: {
          assignment_id?: string
          consented?: boolean
          created_at?: string | null
          document_body?: string
          document_title?: string
          id?: string
          signed_at?: string
          signer_email?: string | null
          signer_ip?: string | null
          signer_user_agent?: string | null
          source_document_id?: string | null
          source_file_path?: string | null
          template_id?: string
          template_version?: number
          typed_legal_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_document_signatures_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "employee_document_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_document_signatures_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "company_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_document_signatures_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "hr_document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_expense_receipts: {
        Row: {
          created_at: string | null
          expense_report_id: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          expense_report_id: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          expense_report_id?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_expense_receipts_expense_report_id_fkey"
            columns: ["expense_report_id"]
            isOneToOne: false
            referencedRelation: "employee_expense_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_expense_reports: {
        Row: {
          amount: number
          business_purpose: string
          category: string
          created_at: string | null
          employee_user_id: string
          expense_date: string
          finance_notes: string | null
          id: string
          merchant: string | null
          notes: string | null
          payment_method: string | null
          reimbursed_at: string | null
          reimbursed_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          business_purpose: string
          category: string
          created_at?: string | null
          employee_user_id: string
          expense_date?: string
          finance_notes?: string | null
          id?: string
          merchant?: string | null
          notes?: string | null
          payment_method?: string | null
          reimbursed_at?: string | null
          reimbursed_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          business_purpose?: string
          category?: string
          created_at?: string | null
          employee_user_id?: string
          expense_date?: string
          finance_notes?: string | null
          id?: string
          merchant?: string | null
          notes?: string | null
          payment_method?: string | null
          reimbursed_at?: string | null
          reimbursed_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      employee_form_responses: {
        Row: {
          answers: Json
          assignment_id: string
          created_at: string | null
          form_definition_id: string
          form_snapshot: Json
          form_version: number
          id: string
          signed_at: string | null
          status: string
          template_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          answers?: Json
          assignment_id: string
          created_at?: string | null
          form_definition_id: string
          form_snapshot: Json
          form_version: number
          id?: string
          signed_at?: string | null
          status?: string
          template_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          answers?: Json
          assignment_id?: string
          created_at?: string | null
          form_definition_id?: string
          form_snapshot?: Json
          form_version?: number
          id?: string
          signed_at?: string | null
          status?: string
          template_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_form_responses_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "employee_document_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_form_responses_form_definition_id_fkey"
            columns: ["form_definition_id"]
            isOneToOne: false
            referencedRelation: "hr_form_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_form_responses_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "hr_document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_mail_delivery_events: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          mailbox_id: string | null
          message_id: string | null
          payload: Json
          provider: string
          provider_event_id: string | null
          provider_message_id: string | null
          recipient_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          mailbox_id?: string | null
          message_id?: string | null
          payload?: Json
          provider?: string
          provider_event_id?: string | null
          provider_message_id?: string | null
          recipient_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          mailbox_id?: string | null
          message_id?: string | null
          payload?: Json
          provider?: string
          provider_event_id?: string | null
          provider_message_id?: string | null
          recipient_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_mail_delivery_events_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "employee_mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_mail_delivery_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "employee_mail_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_mail_delivery_events_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "employee_mail_recipients"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_mail_messages: {
        Row: {
          archived_at: string | null
          attachment_metadata: Json
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          direction: string
          error_message: string | null
          folder: string
          from_address: string
          from_name: string | null
          html_body: string | null
          id: string
          internet_message_id: string | null
          last_provider_event_at: string | null
          mailbox_id: string
          metadata: Json
          plain_body: string
          provider_message_id: string | null
          read_at: string | null
          received_at: string | null
          sent_at: string | null
          status: string
          subject: string
          thread_key: string
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          attachment_metadata?: Json
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          direction: string
          error_message?: string | null
          folder: string
          from_address: string
          from_name?: string | null
          html_body?: string | null
          id?: string
          internet_message_id?: string | null
          last_provider_event_at?: string | null
          mailbox_id: string
          metadata?: Json
          plain_body?: string
          provider_message_id?: string | null
          read_at?: string | null
          received_at?: string | null
          sent_at?: string | null
          status: string
          subject?: string
          thread_key: string
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          attachment_metadata?: Json
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          direction?: string
          error_message?: string | null
          folder?: string
          from_address?: string
          from_name?: string | null
          html_body?: string | null
          id?: string
          internet_message_id?: string | null
          last_provider_event_at?: string | null
          mailbox_id?: string
          metadata?: Json
          plain_body?: string
          provider_message_id?: string | null
          read_at?: string | null
          received_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          thread_key?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_mail_messages_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "employee_mailboxes"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_mail_recipients: {
        Row: {
          address: string
          created_at: string | null
          delivery_status: string
          id: string
          mailbox_id: string | null
          message_id: string
          name: string | null
          provider_message_id: string | null
          recipient_type: string
          updated_at: string | null
        }
        Insert: {
          address: string
          created_at?: string | null
          delivery_status?: string
          id?: string
          mailbox_id?: string | null
          message_id: string
          name?: string | null
          provider_message_id?: string | null
          recipient_type: string
          updated_at?: string | null
        }
        Update: {
          address?: string
          created_at?: string | null
          delivery_status?: string
          id?: string
          mailbox_id?: string | null
          message_id?: string
          name?: string | null
          provider_message_id?: string | null
          recipient_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_mail_recipients_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "employee_mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_mail_recipients_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "employee_mail_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_mailboxes: {
        Row: {
          address: string
          created_at: string | null
          created_by: string | null
          display_name: string | null
          id: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address: string
          created_at?: string | null
          created_by?: string | null
          display_name?: string | null
          id?: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string | null
          created_by?: string | null
          display_name?: string | null
          id?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      employee_onboarding_audit_events: {
        Row: {
          actor_user_id: string | null
          assignment_id: string | null
          created_at: string | null
          event_details: Json
          event_type: string
          id: string
          signer_ip: string | null
          signer_user_agent: string | null
          user_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          assignment_id?: string | null
          created_at?: string | null
          event_details?: Json
          event_type: string
          id?: string
          signer_ip?: string | null
          signer_user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          assignment_id?: string | null
          created_at?: string | null
          event_details?: Json
          event_type?: string
          id?: string
          signer_ip?: string | null
          signer_user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_onboarding_audit_events_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "employee_document_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_onboarding_uploads: {
        Row: {
          assignment_id: string
          compliance_requirement_id: string | null
          created_at: string | null
          file_bucket: string
          file_name: string
          file_path: string
          file_sha256: string
          file_size: number
          file_type: string
          id: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          superseded_by: string | null
          template_id: string
          updated_at: string | null
          upload_status: string
          user_id: string
        }
        Insert: {
          assignment_id: string
          compliance_requirement_id?: string | null
          created_at?: string | null
          file_bucket?: string
          file_name: string
          file_path: string
          file_sha256: string
          file_size: number
          file_type: string
          id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          superseded_by?: string | null
          template_id: string
          updated_at?: string | null
          upload_status?: string
          user_id: string
        }
        Update: {
          assignment_id?: string
          compliance_requirement_id?: string | null
          created_at?: string | null
          file_bucket?: string
          file_name?: string
          file_path?: string
          file_sha256?: string
          file_size?: number
          file_type?: string
          id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          superseded_by?: string | null
          template_id?: string
          updated_at?: string | null
          upload_status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_onboarding_uploads_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "employee_document_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_onboarding_uploads_compliance_requirement_id_fkey"
            columns: ["compliance_requirement_id"]
            isOneToOne: false
            referencedRelation: "hr_compliance_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_onboarding_uploads_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "employee_onboarding_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_onboarding_uploads_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "hr_document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_pay_rates: {
        Row: {
          created_at: string | null
          effective_date: string
          hourly_rate: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          effective_date?: string
          hourly_rate?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          effective_date?: string
          hourly_rate?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      employee_payroll_run_items: {
        Row: {
          created_at: string | null
          employee_user_id: string | null
          federal_tax: number
          gross_pay: number
          hourly_rate: number
          id: string
          item_status: string
          medicare: number
          net_pay: number | null
          notes: string | null
          other_deductions: number
          payroll_run_id: string
          social_security: number
          state_tax: number
          time_card_id: string
          total_hours: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          employee_user_id?: string | null
          federal_tax?: number
          gross_pay?: number
          hourly_rate?: number
          id?: string
          item_status?: string
          medicare?: number
          net_pay?: number | null
          notes?: string | null
          other_deductions?: number
          payroll_run_id: string
          social_security?: number
          state_tax?: number
          time_card_id: string
          total_hours?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          employee_user_id?: string | null
          federal_tax?: number
          gross_pay?: number
          hourly_rate?: number
          id?: string
          item_status?: string
          medicare?: number
          net_pay?: number | null
          notes?: string | null
          other_deductions?: number
          payroll_run_id?: string
          social_security?: number
          state_tax?: number
          time_card_id?: string
          total_hours?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_payroll_run_items_payroll_run_id_fkey"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "employee_payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_payroll_run_items_time_card_id_fkey"
            columns: ["time_card_id"]
            isOneToOne: true
            referencedRelation: "employee_time_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_payroll_runs: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          period_end: string
          period_start: string
          status: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          period_end: string
          period_start: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          period_end?: string
          period_start?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      employee_payroll_setup_tasks: {
        Row: {
          benefits_reviewed: boolean
          created_at: string | null
          created_by: string | null
          direct_deposit_ready: boolean
          due_date: string | null
          i9_reviewed: boolean
          id: string
          jurisdiction_state: string | null
          notes: string | null
          payroll_provider: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_candidate_id: string | null
          state_new_hire_reported: boolean
          status: string
          updated_at: string | null
          user_id: string
          w4_received: boolean
        }
        Insert: {
          benefits_reviewed?: boolean
          created_at?: string | null
          created_by?: string | null
          direct_deposit_ready?: boolean
          due_date?: string | null
          i9_reviewed?: boolean
          id?: string
          jurisdiction_state?: string | null
          notes?: string | null
          payroll_provider?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_candidate_id?: string | null
          state_new_hire_reported?: boolean
          status?: string
          updated_at?: string | null
          user_id: string
          w4_received?: boolean
        }
        Update: {
          benefits_reviewed?: boolean
          created_at?: string | null
          created_by?: string | null
          direct_deposit_ready?: boolean
          due_date?: string | null
          i9_reviewed?: boolean
          id?: string
          jurisdiction_state?: string | null
          notes?: string | null
          payroll_provider?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_candidate_id?: string | null
          state_new_hire_reported?: boolean
          status?: string
          updated_at?: string | null
          user_id?: string
          w4_received?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "employee_payroll_setup_tasks_source_candidate_id_fkey"
            columns: ["source_candidate_id"]
            isOneToOne: false
            referencedRelation: "hr_candidate_intakes"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_profiles: {
        Row: {
          created_at: string | null
          display_name: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relationship: string | null
          legal_name: string | null
          onboarding_completed_at: string | null
          onboarding_status: string
          phone: string | null
          profile_status: string
          time_card_role_id: string | null
          updated_at: string | null
          user_id: string
          work_state: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          legal_name?: string | null
          onboarding_completed_at?: string | null
          onboarding_status?: string
          phone?: string | null
          profile_status?: string
          time_card_role_id?: string | null
          updated_at?: string | null
          user_id: string
          work_state?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relationship?: string | null
          legal_name?: string | null
          onboarding_completed_at?: string | null
          onboarding_status?: string
          phone?: string | null
          profile_status?: string
          time_card_role_id?: string | null
          updated_at?: string | null
          user_id?: string
          work_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_profiles_time_card_role_id_fkey"
            columns: ["time_card_role_id"]
            isOneToOne: false
            referencedRelation: "time_card_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_signed_documents: {
        Row: {
          answer_snapshot: Json
          assignment_id: string
          created_at: string | null
          file_bucket: string
          file_name: string
          file_path: string
          file_sha256: string
          file_type: string
          form_definition_id: string
          form_snapshot: Json
          id: string
          response_id: string
          signed_at: string
          signer_email: string | null
          signer_ip: string | null
          signer_user_agent: string | null
          template_id: string
          typed_legal_name: string
          user_id: string
        }
        Insert: {
          answer_snapshot: Json
          assignment_id: string
          created_at?: string | null
          file_bucket?: string
          file_name: string
          file_path: string
          file_sha256: string
          file_type?: string
          form_definition_id: string
          form_snapshot: Json
          id?: string
          response_id: string
          signed_at?: string
          signer_email?: string | null
          signer_ip?: string | null
          signer_user_agent?: string | null
          template_id: string
          typed_legal_name: string
          user_id: string
        }
        Update: {
          answer_snapshot?: Json
          assignment_id?: string
          created_at?: string | null
          file_bucket?: string
          file_name?: string
          file_path?: string
          file_sha256?: string
          file_type?: string
          form_definition_id?: string
          form_snapshot?: Json
          id?: string
          response_id?: string
          signed_at?: string
          signer_email?: string | null
          signer_ip?: string | null
          signer_user_agent?: string | null
          template_id?: string
          typed_legal_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_signed_documents_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: true
            referencedRelation: "employee_document_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_signed_documents_form_definition_id_fkey"
            columns: ["form_definition_id"]
            isOneToOne: false
            referencedRelation: "hr_form_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_signed_documents_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "employee_form_responses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_signed_documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "hr_document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_time_card_payroll: {
        Row: {
          created_at: string | null
          hourly_rate: number
          paid_value: number
          time_card_id: string
          total_hours: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          hourly_rate?: number
          paid_value?: number
          time_card_id: string
          total_hours?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          hourly_rate?: number
          paid_value?: number
          time_card_id?: string
          total_hours?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_time_card_payroll_time_card_id_fkey"
            columns: ["time_card_id"]
            isOneToOne: true
            referencedRelation: "employee_time_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_time_cards: {
        Row: {
          created_at: string | null
          created_by: string | null
          employee_user_id: string | null
          id: string
          import_key: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          status: string
          submitted_at: string | null
          updated_at: string | null
          week_end: string
          week_start: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          employee_user_id?: string | null
          id?: string
          import_key?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string | null
          week_end: string
          week_start: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          employee_user_id?: string | null
          id?: string
          import_key?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string | null
          week_end?: string
          week_start?: string
        }
        Relationships: []
      }
      employee_time_entries: {
        Row: {
          category_id: string
          created_at: string | null
          hours: number
          id: string
          import_key: string | null
          notes: string | null
          source_status: string | null
          task_id: string
          time_card_id: string
          updated_at: string | null
          work_date: string
        }
        Insert: {
          category_id: string
          created_at?: string | null
          hours: number
          id?: string
          import_key?: string | null
          notes?: string | null
          source_status?: string | null
          task_id: string
          time_card_id: string
          updated_at?: string | null
          work_date: string
        }
        Update: {
          category_id?: string
          created_at?: string | null
          hours?: number
          id?: string
          import_key?: string | null
          notes?: string | null
          source_status?: string | null
          task_id?: string
          time_card_id?: string
          updated_at?: string | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_time_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "time_card_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_time_entries_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "time_card_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_time_entries_time_card_id_fkey"
            columns: ["time_card_id"]
            isOneToOne: false
            referencedRelation: "employee_time_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_automation_events: {
        Row: {
          actor_user_id: string | null
          body: string | null
          candidate_intake_id: string | null
          created_at: string | null
          created_by_ai: boolean
          event_type: string
          id: string
          metadata: Json
          notification_id: string | null
          source_id: string | null
          source_type: string
          target_user_id: string | null
          title: string
        }
        Insert: {
          actor_user_id?: string | null
          body?: string | null
          candidate_intake_id?: string | null
          created_at?: string | null
          created_by_ai?: boolean
          event_type: string
          id?: string
          metadata?: Json
          notification_id?: string | null
          source_id?: string | null
          source_type: string
          target_user_id?: string | null
          title: string
        }
        Update: {
          actor_user_id?: string | null
          body?: string | null
          candidate_intake_id?: string | null
          created_at?: string | null
          created_by_ai?: boolean
          event_type?: string
          id?: string
          metadata?: Json
          notification_id?: string | null
          source_id?: string | null
          source_type?: string
          target_user_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_automation_events_candidate_intake_id_fkey"
            columns: ["candidate_intake_id"]
            isOneToOne: false
            referencedRelation: "hr_candidate_intakes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_automation_events_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "portal_notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_candidate_intakes: {
        Row: {
          candidate_name: string
          converted_user_id: string | null
          created_at: string | null
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          email: string
          human_decision: string
          human_decision_notes: string | null
          id: string
          invite_generated_at: string | null
          jurisdiction_state: string | null
          metadata: Json
          notes: string | null
          source: string | null
          status: string
          target_role: string
          updated_at: string | null
        }
        Insert: {
          candidate_name: string
          converted_user_id?: string | null
          created_at?: string | null
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          email: string
          human_decision?: string
          human_decision_notes?: string | null
          id?: string
          invite_generated_at?: string | null
          jurisdiction_state?: string | null
          metadata?: Json
          notes?: string | null
          source?: string | null
          status?: string
          target_role?: string
          updated_at?: string | null
        }
        Update: {
          candidate_name?: string
          converted_user_id?: string | null
          created_at?: string | null
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          email?: string
          human_decision?: string
          human_decision_notes?: string | null
          id?: string
          invite_generated_at?: string | null
          jurisdiction_state?: string | null
          metadata?: Json
          notes?: string | null
          source?: string | null
          status?: string
          target_role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      hr_compliance_requirements: {
        Row: {
          active: boolean
          category: string
          created_at: string | null
          document_mode: string
          due_rule: string | null
          employee_type: string
          id: string
          jurisdiction_level: string
          jurisdiction_state: string | null
          last_reviewed_at: string | null
          official_source_url: string | null
          required: boolean
          retention_rule: string | null
          review_notes: string | null
          review_status: string
          reviewed_by: string | null
          slug: string
          sort_order: number
          title: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string | null
          document_mode?: string
          due_rule?: string | null
          employee_type?: string
          id?: string
          jurisdiction_level?: string
          jurisdiction_state?: string | null
          last_reviewed_at?: string | null
          official_source_url?: string | null
          required?: boolean
          retention_rule?: string | null
          review_notes?: string | null
          review_status?: string
          reviewed_by?: string | null
          slug: string
          sort_order?: number
          title: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string | null
          document_mode?: string
          due_rule?: string | null
          employee_type?: string
          id?: string
          jurisdiction_level?: string
          jurisdiction_state?: string | null
          last_reviewed_at?: string | null
          official_source_url?: string | null
          required?: boolean
          retention_rule?: string | null
          review_notes?: string | null
          review_status?: string
          reviewed_by?: string | null
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      hr_document_templates: {
        Row: {
          active: boolean
          body_text: string
          category: string
          compliance_requirement_id: string | null
          created_at: string | null
          form_definition_id: string | null
          id: string
          required: boolean
          sort_order: number
          source_document_id: string | null
          title: string
          updated_at: string | null
          version: number
        }
        Insert: {
          active?: boolean
          body_text: string
          category?: string
          compliance_requirement_id?: string | null
          created_at?: string | null
          form_definition_id?: string | null
          id?: string
          required?: boolean
          sort_order?: number
          source_document_id?: string | null
          title: string
          updated_at?: string | null
          version?: number
        }
        Update: {
          active?: boolean
          body_text?: string
          category?: string
          compliance_requirement_id?: string | null
          created_at?: string | null
          form_definition_id?: string | null
          id?: string
          required?: boolean
          sort_order?: number
          source_document_id?: string | null
          title?: string
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_document_templates_compliance_requirement_id_fkey"
            columns: ["compliance_requirement_id"]
            isOneToOne: false
            referencedRelation: "hr_compliance_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_document_templates_form_definition_id_fkey"
            columns: ["form_definition_id"]
            isOneToOne: false
            referencedRelation: "hr_form_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_document_templates_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "company_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_form_definitions: {
        Row: {
          active: boolean
          applies_to_state: string | null
          category: string
          compliance_requirement_id: string | null
          created_at: string | null
          description: string | null
          field_schema: Json
          form_source_url: string | null
          id: string
          jurisdiction_code: string
          jurisdiction_type: string
          official_form_edition: string | null
          official_form_expiration_date: string | null
          official_form_name: string | null
          required: boolean
          sensitive: boolean
          slug: string
          sort_order: number
          title: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          applies_to_state?: string | null
          category?: string
          compliance_requirement_id?: string | null
          created_at?: string | null
          description?: string | null
          field_schema?: Json
          form_source_url?: string | null
          id?: string
          jurisdiction_code?: string
          jurisdiction_type?: string
          official_form_edition?: string | null
          official_form_expiration_date?: string | null
          official_form_name?: string | null
          required?: boolean
          sensitive?: boolean
          slug: string
          sort_order?: number
          title: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          applies_to_state?: string | null
          category?: string
          compliance_requirement_id?: string | null
          created_at?: string | null
          description?: string | null
          field_schema?: Json
          form_source_url?: string | null
          id?: string
          jurisdiction_code?: string
          jurisdiction_type?: string
          official_form_edition?: string | null
          official_form_expiration_date?: string | null
          official_form_name?: string | null
          required?: boolean
          sensitive?: boolean
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_form_definitions_compliance_requirement_id_fkey"
            columns: ["compliance_requirement_id"]
            isOneToOne: false
            referencedRelation: "hr_compliance_requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      infra_cost_entries: {
        Row: {
          amount_cents: number
          category: string
          created_at: string | null
          created_by: string | null
          currency: string
          id: string
          notes: string | null
          period_month: string
          service: string
          updated_at: string | null
        }
        Insert: {
          amount_cents?: number
          category?: string
          created_at?: string | null
          created_by?: string | null
          currency?: string
          id?: string
          notes?: string | null
          period_month: string
          service: string
          updated_at?: string | null
        }
        Update: {
          amount_cents?: number
          category?: string
          created_at?: string | null
          created_by?: string | null
          currency?: string
          id?: string
          notes?: string | null
          period_month?: string
          service?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      infra_deployment_log: {
        Row: {
          completed_at: string | null
          deploy_method: string
          duration_seconds: number | null
          environment: string
          error_message: string | null
          git_branch: string | null
          git_sha: string | null
          id: string
          release_id: string | null
          started_at: string | null
          status: string
          triggered_by: string | null
        }
        Insert: {
          completed_at?: string | null
          deploy_method?: string
          duration_seconds?: number | null
          environment: string
          error_message?: string | null
          git_branch?: string | null
          git_sha?: string | null
          id?: string
          release_id?: string | null
          started_at?: string | null
          status?: string
          triggered_by?: string | null
        }
        Update: {
          completed_at?: string | null
          deploy_method?: string
          duration_seconds?: number | null
          environment?: string
          error_message?: string | null
          git_branch?: string | null
          git_sha?: string | null
          id?: string
          release_id?: string | null
          started_at?: string | null
          status?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "infra_deployment_log_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "platform_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      infra_security_scans: {
        Row: {
          critical_count: number | null
          findings_count: number | null
          high_count: number | null
          id: string
          raw_output: string | null
          remediated_at: string | null
          remediated_by: string | null
          scan_type: string
          scanned_at: string | null
          status: string
          summary: string | null
        }
        Insert: {
          critical_count?: number | null
          findings_count?: number | null
          high_count?: number | null
          id?: string
          raw_output?: string | null
          remediated_at?: string | null
          remediated_by?: string | null
          scan_type: string
          scanned_at?: string | null
          status: string
          summary?: string | null
        }
        Update: {
          critical_count?: number | null
          findings_count?: number | null
          high_count?: number | null
          id?: string
          raw_output?: string | null
          remediated_at?: string | null
          remediated_by?: string | null
          scan_type?: string
          scanned_at?: string | null
          status?: string
          summary?: string | null
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string | null
          digest_time: string
          digest_timezone: string
          email_digest_enabled: boolean
          in_app_enabled: boolean
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          digest_time?: string
          digest_timezone?: string
          email_digest_enabled?: boolean
          in_app_enabled?: boolean
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          digest_time?: string
          digest_timezone?: string
          email_digest_enabled?: boolean
          in_app_enabled?: boolean
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      performance_review_cycles: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          manager_review_due: string | null
          period_end: string | null
          period_label: string | null
          period_start: string | null
          review_type: string
          self_assessment_due: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          manager_review_due?: string | null
          period_end?: string | null
          period_label?: string | null
          period_start?: string | null
          review_type?: string
          self_assessment_due?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          manager_review_due?: string | null
          period_end?: string | null
          period_label?: string | null
          period_start?: string | null
          review_type?: string
          self_assessment_due?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      performance_reviews: {
        Row: {
          created_at: string
          cycle_id: string
          employee_user_id: string
          id: string
          manager_goals: string | null
          manager_highlights: string | null
          manager_improvements: string | null
          manager_notes: string | null
          manager_review_status: string
          manager_submitted_at: string | null
          overall_manager_rating: number | null
          overall_self_rating: number | null
          reviewer_user_id: string | null
          self_assessment_status: string
          self_goals: string | null
          self_highlights: string | null
          self_improvements: string | null
          self_submitted_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          cycle_id: string
          employee_user_id: string
          id?: string
          manager_goals?: string | null
          manager_highlights?: string | null
          manager_improvements?: string | null
          manager_notes?: string | null
          manager_review_status?: string
          manager_submitted_at?: string | null
          overall_manager_rating?: number | null
          overall_self_rating?: number | null
          reviewer_user_id?: string | null
          self_assessment_status?: string
          self_goals?: string | null
          self_highlights?: string | null
          self_improvements?: string | null
          self_submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          cycle_id?: string
          employee_user_id?: string
          id?: string
          manager_goals?: string | null
          manager_highlights?: string | null
          manager_improvements?: string | null
          manager_notes?: string | null
          manager_review_status?: string
          manager_submitted_at?: string | null
          overall_manager_rating?: number | null
          overall_self_rating?: number | null
          reviewer_user_id?: string | null
          self_assessment_status?: string
          self_goals?: string | null
          self_highlights?: string | null
          self_improvements?: string | null
          self_submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_reviews_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "performance_review_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_audit_events: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          after_state: Json | null
          before_state: Json | null
          created_at: string | null
          event_category: string
          event_type: string
          evidence_links: string[] | null
          id: string
          ip_address: string | null
          resource_id: string | null
          resource_type: string | null
          severity: string
          summary: string
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string | null
          event_category?: string
          event_type: string
          evidence_links?: string[] | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type?: string | null
          severity?: string
          summary: string
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string | null
          event_category?: string
          event_type?: string
          evidence_links?: string[] | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type?: string | null
          severity?: string
          summary?: string
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      platform_health_checks: {
        Row: {
          check_name: string
          checked_at: string | null
          details: Json | null
          id: string
          response_ms: number | null
          status: string
        }
        Insert: {
          check_name: string
          checked_at?: string | null
          details?: Json | null
          id?: string
          response_ms?: number | null
          status: string
        }
        Update: {
          check_name?: string
          checked_at?: string | null
          details?: Json | null
          id?: string
          response_ms?: number | null
          status?: string
        }
        Relationships: []
      }
      platform_releases: {
        Row: {
          created_at: string | null
          deployed_at: string | null
          deployed_by: string | null
          environment: string
          id: string
          migration_required: boolean | null
          release_notes: string | null
          rollback_plan: string | null
          sign_off_required: boolean | null
          signed_off_at: string | null
          signed_off_by: string | null
          status: string
          title: string
          updated_at: string | null
          version: string
        }
        Insert: {
          created_at?: string | null
          deployed_at?: string | null
          deployed_by?: string | null
          environment?: string
          id?: string
          migration_required?: boolean | null
          release_notes?: string | null
          rollback_plan?: string | null
          sign_off_required?: boolean | null
          signed_off_at?: string | null
          signed_off_by?: string | null
          status?: string
          title: string
          updated_at?: string | null
          version: string
        }
        Update: {
          created_at?: string | null
          deployed_at?: string | null
          deployed_by?: string | null
          environment?: string
          id?: string
          migration_required?: boolean | null
          release_notes?: string | null
          rollback_plan?: string | null
          sign_off_required?: boolean | null
          signed_off_at?: string | null
          signed_off_by?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          version?: string
        }
        Relationships: []
      }
      platform_runbooks: {
        Row: {
          category: string
          content: string
          created_at: string | null
          created_by: string | null
          id: string
          last_reviewed_at: string | null
          reviewed_by: string | null
          title: string
          updated_at: string | null
          version: string | null
        }
        Insert: {
          category?: string
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          last_reviewed_at?: string | null
          reviewed_by?: string | null
          title: string
          updated_at?: string | null
          version?: string | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          last_reviewed_at?: string | null
          reviewed_by?: string | null
          title?: string
          updated_at?: string | null
          version?: string | null
        }
        Relationships: []
      }
      platform_sprint_tasks: {
        Row: {
          assigned_to: string | null
          blocker_note: string | null
          created_at: string | null
          description: string | null
          estimate_points: number | null
          id: string
          priority: string
          sprint_id: string | null
          status: string
          tags: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          blocker_note?: string | null
          created_at?: string | null
          description?: string | null
          estimate_points?: number | null
          id?: string
          priority?: string
          sprint_id?: string | null
          status?: string
          tags?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          blocker_note?: string | null
          created_at?: string | null
          description?: string | null
          estimate_points?: number | null
          id?: string
          priority?: string
          sprint_id?: string | null
          status?: string
          tags?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_sprint_tasks_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "platform_sprints"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_sprints: {
        Row: {
          capacity_points: number | null
          created_at: string | null
          created_by: string | null
          end_date: string
          goal: string | null
          id: string
          notes: string | null
          sprint_number: number
          start_date: string
          status: string
          title: string
          updated_at: string | null
          velocity_points: number | null
        }
        Insert: {
          capacity_points?: number | null
          created_at?: string | null
          created_by?: string | null
          end_date: string
          goal?: string | null
          id?: string
          notes?: string | null
          sprint_number: number
          start_date: string
          status?: string
          title: string
          updated_at?: string | null
          velocity_points?: number | null
        }
        Update: {
          capacity_points?: number | null
          created_at?: string | null
          created_by?: string | null
          end_date?: string
          goal?: string | null
          id?: string
          notes?: string | null
          sprint_number?: number
          start_date?: string
          status?: string
          title?: string
          updated_at?: string | null
          velocity_points?: number | null
        }
        Relationships: []
      }
      platform_subscription_tiers: {
        Row: {
          annual_price_cents: number
          created_at: string | null
          description: string | null
          features: Json
          id: string
          is_active: boolean | null
          max_sites: number | null
          max_users: number | null
          monthly_price_cents: number
          name: string
          sort_order: number | null
          tier_key: string
          updated_at: string | null
        }
        Insert: {
          annual_price_cents?: number
          created_at?: string | null
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean | null
          max_sites?: number | null
          max_users?: number | null
          monthly_price_cents?: number
          name: string
          sort_order?: number | null
          tier_key: string
          updated_at?: string | null
        }
        Update: {
          annual_price_cents?: number
          created_at?: string | null
          description?: string | null
          features?: Json
          id?: string
          is_active?: boolean | null
          max_sites?: number | null
          max_users?: number | null
          monthly_price_cents?: number
          name?: string
          sort_order?: number | null
          tier_key?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      platform_tenant_subscriptions: {
        Row: {
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          id: string
          max_users_override: number | null
          notes: string | null
          status: string
          tenant_email: string | null
          tenant_name: string
          tier_id: string | null
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          max_users_override?: number | null
          notes?: string | null
          status?: string
          tenant_email?: string | null
          tenant_name: string
          tier_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          max_users_override?: number | null
          notes?: string | null
          status?: string
          tenant_email?: string | null
          tenant_name?: string
          tier_id?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_tenant_subscriptions_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "platform_subscription_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_test_plans: {
        Row: {
          blocked_scenarios: number | null
          created_at: string | null
          created_by: string | null
          failed_scenarios: number | null
          id: string
          passed_scenarios: number | null
          related_release_id: string | null
          status: string
          title: string
          total_scenarios: number | null
          updated_at: string | null
        }
        Insert: {
          blocked_scenarios?: number | null
          created_at?: string | null
          created_by?: string | null
          failed_scenarios?: number | null
          id?: string
          passed_scenarios?: number | null
          related_release_id?: string | null
          status?: string
          title: string
          total_scenarios?: number | null
          updated_at?: string | null
        }
        Update: {
          blocked_scenarios?: number | null
          created_at?: string | null
          created_by?: string | null
          failed_scenarios?: number | null
          id?: string
          passed_scenarios?: number | null
          related_release_id?: string | null
          status?: string
          title?: string
          total_scenarios?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_test_plans_related_release_id_fkey"
            columns: ["related_release_id"]
            isOneToOne: false
            referencedRelation: "platform_releases"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_test_results: {
        Row: {
          acceptance_criteria: string | null
          created_at: string | null
          id: string
          notes: string | null
          result: string
          scenario: string
          test_plan_id: string | null
          tested_at: string | null
          tested_by: string | null
        }
        Insert: {
          acceptance_criteria?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          result?: string
          scenario: string
          test_plan_id?: string | null
          tested_at?: string | null
          tested_by?: string | null
        }
        Update: {
          acceptance_criteria?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          result?: string
          scenario?: string
          test_plan_id?: string | null
          tested_at?: string | null
          tested_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_test_results_test_plan_id_fkey"
            columns: ["test_plan_id"]
            isOneToOne: false
            referencedRelation: "platform_test_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_vertical_packages: {
        Row: {
          changelog: string | null
          created_at: string | null
          current_version: string
          description: string | null
          id: string
          name: string
          owner_notes: string | null
          pilot_feature_flags: Json | null
          repository_url: string | null
          scenario_test_count: number | null
          status: string
          updated_at: string | null
          vertical_key: string
        }
        Insert: {
          changelog?: string | null
          created_at?: string | null
          current_version?: string
          description?: string | null
          id?: string
          name: string
          owner_notes?: string | null
          pilot_feature_flags?: Json | null
          repository_url?: string | null
          scenario_test_count?: number | null
          status?: string
          updated_at?: string | null
          vertical_key: string
        }
        Update: {
          changelog?: string | null
          created_at?: string | null
          current_version?: string
          description?: string | null
          id?: string
          name?: string
          owner_notes?: string | null
          pilot_feature_flags?: Json | null
          repository_url?: string | null
          scenario_test_count?: number | null
          status?: string
          updated_at?: string | null
          vertical_key?: string
        }
        Relationships: []
      }
      portal_notifications: {
        Row: {
          action_href: string | null
          ai_summary: string | null
          archived_at: string | null
          body: string
          created_at: string | null
          created_by_ai: boolean
          dedupe_key: string | null
          id: string
          metadata: Json
          priority: string
          read_at: string | null
          recipient_user_id: string
          source_id: string | null
          source_type: string | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          action_href?: string | null
          ai_summary?: string | null
          archived_at?: string | null
          body: string
          created_at?: string | null
          created_by_ai?: boolean
          dedupe_key?: string | null
          id?: string
          metadata?: Json
          priority?: string
          read_at?: string | null
          recipient_user_id: string
          source_id?: string | null
          source_type?: string | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          action_href?: string | null
          ai_summary?: string | null
          archived_at?: string | null
          body?: string
          created_at?: string | null
          created_by_ai?: boolean
          dedupe_key?: string | null
          id?: string
          metadata?: Json
          priority?: string
          read_at?: string | null
          recipient_user_id?: string
          source_id?: string | null
          source_type?: string | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      portal_user_module_access: {
        Row: {
          created_at: string | null
          granted_by: string | null
          module_key: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          granted_by?: string | null
          module_key: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          granted_by?: string | null
          module_key?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sales_video_meeting_invites: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          expires_at: string
          id: string
          meeting_id: string
          recipient_email: string
          recipient_name: string | null
          revoked_at: string | null
          sent_at: string | null
          status: string
          token_hash: string
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          expires_at: string
          id?: string
          meeting_id: string
          recipient_email: string
          recipient_name?: string | null
          revoked_at?: string | null
          sent_at?: string | null
          status?: string
          token_hash: string
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          expires_at?: string
          id?: string
          meeting_id?: string
          recipient_email?: string
          recipient_name?: string | null
          revoked_at?: string | null
          sent_at?: string | null
          status?: string
          token_hash?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_video_meeting_invites_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "sales_video_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_video_meeting_participants: {
        Row: {
          audio_enabled: boolean
          created_at: string | null
          display_name: string
          email: string | null
          guest_user_id: string | null
          id: string
          invite_id: string | null
          joined_at: string | null
          left_at: string | null
          meeting_id: string
          participant_type: string
          screen_sharing: boolean
          status: string
          updated_at: string | null
          user_id: string | null
          video_enabled: boolean
        }
        Insert: {
          audio_enabled?: boolean
          created_at?: string | null
          display_name: string
          email?: string | null
          guest_user_id?: string | null
          id?: string
          invite_id?: string | null
          joined_at?: string | null
          left_at?: string | null
          meeting_id: string
          participant_type: string
          screen_sharing?: boolean
          status?: string
          updated_at?: string | null
          user_id?: string | null
          video_enabled?: boolean
        }
        Update: {
          audio_enabled?: boolean
          created_at?: string | null
          display_name?: string
          email?: string | null
          guest_user_id?: string | null
          id?: string
          invite_id?: string | null
          joined_at?: string | null
          left_at?: string | null
          meeting_id?: string
          participant_type?: string
          screen_sharing?: boolean
          status?: string
          updated_at?: string | null
          user_id?: string | null
          video_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "sales_video_meeting_participants_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "sales_video_meeting_invites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_video_meeting_participants_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "sales_video_meetings"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_video_meetings: {
        Row: {
          client_id: string | null
          created_at: string | null
          created_by: string | null
          demo_request_id: string | null
          ended_at: string | null
          expires_at: string
          id: string
          scheduled_at: string | null
          started_at: string | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          demo_request_id?: string | null
          ended_at?: string | null
          expires_at?: string
          id?: string
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          demo_request_id?: string | null
          ended_at?: string | null
          expires_at?: string
          id?: string
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_video_meetings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_video_meetings_demo_request_id_fkey"
            columns: ["demo_request_id"]
            isOneToOne: false
            referencedRelation: "demo_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_recipients: {
        Row: {
          active: boolean
          created_at: string | null
          label: string
          recipient_user_id: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          label?: string
          recipient_user_id: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string | null
          label?: string
          recipient_user_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          assigned_to_user_id: string | null
          category: string
          company: string | null
          created_at: string | null
          id: string
          issue_url: string | null
          message: string
          metadata: Json
          priority: string
          status: string
          subject: string
          submitted_by_user_id: string | null
          submitter_email: string
          submitter_name: string
          submitter_phone: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_to_user_id?: string | null
          category?: string
          company?: string | null
          created_at?: string | null
          id?: string
          issue_url?: string | null
          message: string
          metadata?: Json
          priority?: string
          status?: string
          subject: string
          submitted_by_user_id?: string | null
          submitter_email: string
          submitter_name: string
          submitter_phone?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_to_user_id?: string | null
          category?: string
          company?: string | null
          created_at?: string | null
          id?: string
          issue_url?: string | null
          message?: string
          metadata?: Json
          priority?: string
          status?: string
          subject?: string
          submitted_by_user_id?: string | null
          submitter_email?: string
          submitter_name?: string
          submitter_phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      time_card_categories: {
        Row: {
          created_at: string | null
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      time_card_role_categories: {
        Row: {
          category_id: string
          created_at: string | null
          role_id: string
        }
        Insert: {
          category_id: string
          created_at?: string | null
          role_id: string
        }
        Update: {
          category_id?: string
          created_at?: string | null
          role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_card_role_categories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "time_card_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_card_role_categories_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "time_card_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      time_card_role_tasks: {
        Row: {
          created_at: string | null
          role_id: string
          task_id: string
        }
        Insert: {
          created_at?: string | null
          role_id: string
          task_id: string
        }
        Update: {
          created_at?: string | null
          role_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_card_role_tasks_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "time_card_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_card_role_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "time_card_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      time_card_roles: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      time_card_tasks: {
        Row: {
          category_id: string
          created_at: string | null
          id: string
          is_review_task: boolean
          slug: string
          sort_order: number
          title: string
        }
        Insert: {
          category_id: string
          created_at?: string | null
          id?: string
          is_review_task?: boolean
          slug: string
          sort_order?: number
          title: string
        }
        Update: {
          category_id?: string
          created_at?: string | null
          id?: string
          is_review_task?: boolean
          slug?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_card_tasks_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "time_card_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      training_certifications: {
        Row: {
          cert_document_url: string | null
          certification_name: string
          client_id: string | null
          completion_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          issued_at: string
          learner_email: string | null
          learner_name: string
          status: string
          updated_at: string
        }
        Insert: {
          cert_document_url?: string | null
          certification_name: string
          client_id?: string | null
          completion_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_at: string
          learner_email?: string | null
          learner_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          cert_document_url?: string | null
          certification_name?: string
          client_id?: string | null
          completion_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          issued_at?: string
          learner_email?: string | null
          learner_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_certifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_certifications_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: true
            referencedRelation: "training_completions"
            referencedColumns: ["id"]
          },
        ]
      }
      training_completions: {
        Row: {
          client_id: string | null
          completed_at: string
          created_at: string
          external_lms_course_id: string
          external_lms_user_id: string
          id: string
          learner_email: string | null
          learner_name: string
          module_id: string | null
          passed: boolean | null
          raw_payload: Json | null
          score: number | null
          time_spent_seconds: number | null
        }
        Insert: {
          client_id?: string | null
          completed_at: string
          created_at?: string
          external_lms_course_id: string
          external_lms_user_id: string
          id?: string
          learner_email?: string | null
          learner_name: string
          module_id?: string | null
          passed?: boolean | null
          raw_payload?: Json | null
          score?: number | null
          time_spent_seconds?: number | null
        }
        Update: {
          client_id?: string | null
          completed_at?: string
          created_at?: string
          external_lms_course_id?: string
          external_lms_user_id?: string
          id?: string
          learner_email?: string | null
          learner_name?: string
          module_id?: string | null
          passed?: boolean | null
          raw_payload?: Json | null
          score?: number | null
          time_spent_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "training_completions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_completions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      training_module_files: {
        Row: {
          created_at: string | null
          file_bucket: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          module_id: string
          sort_order: number
          updated_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          file_bucket?: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          module_id: string
          sort_order?: number
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          file_bucket?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          module_id?: string
          sort_order?: number
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "training_module_files_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "training_modules"
            referencedColumns: ["id"]
          },
        ]
      }
      training_modules: {
        Row: {
          audience: string
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          estimated_duration_minutes: number | null
          external_lms_course_id: string | null
          id: string
          owner: string | null
          status: string
          title: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          audience?: string
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          estimated_duration_minutes?: number | null
          external_lms_course_id?: string | null
          id?: string
          owner?: string | null
          status?: string
          title: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          audience?: string
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          estimated_duration_minutes?: number | null
          external_lms_course_id?: string | null
          id?: string
          owner?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          account_status: string
          company_id: string | null
          created_at: string | null
          role: string
          team: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_status?: string
          company_id?: string | null
          created_at?: string | null
          role?: string
          team?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_status?: string
          company_id?: string | null
          created_at?: string | null
          role?: string
          team?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      website_content_items: {
        Row: {
          ai_notes: string | null
          approved_at: string | null
          approved_by: string | null
          approved_value: string | null
          content_key: string
          content_type: string
          created_at: string | null
          created_by: string | null
          created_by_ai: boolean
          draft_value: string | null
          fallback_value: string
          id: string
          metadata: Json
          risk_level: string
          route_path: string
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          ai_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_value?: string | null
          content_key: string
          content_type?: string
          created_at?: string | null
          created_by?: string | null
          created_by_ai?: boolean
          draft_value?: string | null
          fallback_value?: string
          id?: string
          metadata?: Json
          risk_level?: string
          route_path?: string
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          ai_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          approved_value?: string | null
          content_key?: string
          content_type?: string
          created_at?: string | null
          created_by?: string | null
          created_by_ai?: boolean
          draft_value?: string | null
          fallback_value?: string
          id?: string
          metadata?: Json
          risk_level?: string
          route_path?: string
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      website_health_checks: {
        Row: {
          broken_links: Json
          checked_at: string
          content_gaps: string[]
          created_at: string | null
          error_message: string | null
          h1: string | null
          id: string
          metadata: Json
          response_ms: number | null
          route_path: string
          scan_id: string
          seo_description: string | null
          seo_title: string | null
          status: string
          status_code: number | null
          target_url: string
        }
        Insert: {
          broken_links?: Json
          checked_at?: string
          content_gaps?: string[]
          created_at?: string | null
          error_message?: string | null
          h1?: string | null
          id?: string
          metadata?: Json
          response_ms?: number | null
          route_path: string
          scan_id?: string
          seo_description?: string | null
          seo_title?: string | null
          status?: string
          status_code?: number | null
          target_url: string
        }
        Update: {
          broken_links?: Json
          checked_at?: string
          content_gaps?: string[]
          created_at?: string | null
          error_message?: string | null
          h1?: string | null
          id?: string
          metadata?: Json
          response_ms?: number | null
          route_path?: string
          scan_id?: string
          seo_description?: string | null
          seo_title?: string | null
          status?: string
          status_code?: number | null
          target_url?: string
        }
        Relationships: []
      }
      website_operations_events: {
        Row: {
          actor_user_id: string | null
          body: string | null
          created_at: string | null
          created_by_ai: boolean
          event_type: string
          health_check_id: string | null
          id: string
          metadata: Json
          notification_id: string | null
          proposal_id: string | null
          risk_level: string
          source_id: string | null
          source_type: string
          title: string
        }
        Insert: {
          actor_user_id?: string | null
          body?: string | null
          created_at?: string | null
          created_by_ai?: boolean
          event_type: string
          health_check_id?: string | null
          id?: string
          metadata?: Json
          notification_id?: string | null
          proposal_id?: string | null
          risk_level?: string
          source_id?: string | null
          source_type: string
          title: string
        }
        Update: {
          actor_user_id?: string | null
          body?: string | null
          created_at?: string | null
          created_by_ai?: boolean
          event_type?: string
          health_check_id?: string | null
          id?: string
          metadata?: Json
          notification_id?: string | null
          proposal_id?: string | null
          risk_level?: string
          source_id?: string | null
          source_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_operations_events_health_check_id_fkey"
            columns: ["health_check_id"]
            isOneToOne: false
            referencedRelation: "website_health_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_operations_events_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "portal_notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_operations_events_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "workflow_action_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_action_proposals: {
        Row: {
          action_type: string
          applied_at: string | null
          approval_notes: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          created_by_ai: boolean
          created_by_user_id: string | null
          description: string
          id: string
          metadata: Json
          proposed_patch: Json
          risk_level: string
          status: string
          target_record_id: string | null
          target_table: string
          target_user_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          action_type: string
          applied_at?: string | null
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by_ai?: boolean
          created_by_user_id?: string | null
          description: string
          id?: string
          metadata?: Json
          proposed_patch?: Json
          risk_level?: string
          status?: string
          target_record_id?: string | null
          target_table: string
          target_user_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          action_type?: string
          applied_at?: string | null
          approval_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          created_by_ai?: boolean
          created_by_user_id?: string | null
          description?: string
          id?: string
          metadata?: Json
          proposed_patch?: Json
          risk_level?: string
          status?: string
          target_record_id?: string | null
          target_table?: string
          target_user_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      company_position_employee_directory: {
        Row: {
          display_name: string | null
          email: string | null
          legal_name: string | null
          phone: string | null
          position_id: string | null
          profile_status: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      is_company_finance_user: { Args: never; Returns: boolean }
      is_company_portal_admin: { Args: never; Returns: boolean }
      is_company_portal_employee: { Args: never; Returns: boolean }
      is_company_portal_owner: { Args: never; Returns: boolean }
      is_company_portal_super_admin: { Args: never; Returns: boolean }
      mark_employee_last_seen: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
