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
      audit_checklist_items: {
        Row: {
          answer_type: string | null
          checklist_item: string | null
          citation: string | null
          company_id: string | null
          corrective_action_trigger: string | null
          created_at: string | null
          evidence_required: string | null
          frequency: string | null
          id: string
          legal_register_entry_id: string | null
          module_assignment: string | null
          program: string | null
          project_id: string | null
          question_text: string | null
          research_run_id: string | null
          responsible_role: string | null
          risk_level: string | null
          source_url: string | null
          updated_at: string | null
        }
        Insert: {
          answer_type?: string | null
          checklist_item?: string | null
          citation?: string | null
          company_id?: string | null
          corrective_action_trigger?: string | null
          created_at?: string | null
          evidence_required?: string | null
          frequency?: string | null
          id?: string
          legal_register_entry_id?: string | null
          module_assignment?: string | null
          program?: string | null
          project_id?: string | null
          question_text?: string | null
          research_run_id?: string | null
          responsible_role?: string | null
          risk_level?: string | null
          source_url?: string | null
          updated_at?: string | null
        }
        Update: {
          answer_type?: string | null
          checklist_item?: string | null
          citation?: string | null
          company_id?: string | null
          corrective_action_trigger?: string | null
          created_at?: string | null
          evidence_required?: string | null
          frequency?: string | null
          id?: string
          legal_register_entry_id?: string | null
          module_assignment?: string | null
          program?: string | null
          project_id?: string | null
          question_text?: string | null
          research_run_id?: string | null
          responsible_role?: string | null
          risk_level?: string | null
          source_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_checklist_items_legal_register_entry_id_fkey"
            columns: ["legal_register_entry_id"]
            isOneToOne: false
            referencedRelation: "legal_register_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_checklist_items_research_run_id_fkey"
            columns: ["research_run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
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
      client_proposal_approvals: {
        Row: {
          decided_at: string
          decided_by: string | null
          decision: string
          id: string
          note: string | null
          proposal_id: string
          revision_id: string | null
          revision_number: number
        }
        Insert: {
          decided_at?: string
          decided_by?: string | null
          decision: string
          id?: string
          note?: string | null
          proposal_id: string
          revision_id?: string | null
          revision_number: number
        }
        Update: {
          decided_at?: string
          decided_by?: string | null
          decision?: string
          id?: string
          note?: string | null
          proposal_id?: string
          revision_id?: string | null
          revision_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_proposal_approvals_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "client_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_proposal_approvals_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "client_proposal_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      client_proposal_revisions: {
        Row: {
          body_markdown: string | null
          change_note: string | null
          created_at: string | null
          created_by: string | null
          form_data: Json | null
          id: string
          proposal_id: string
          revision_number: number
          status_at_save: string | null
          summary: string | null
          title: string
        }
        Insert: {
          body_markdown?: string | null
          change_note?: string | null
          created_at?: string | null
          created_by?: string | null
          form_data?: Json | null
          id?: string
          proposal_id: string
          revision_number: number
          status_at_save?: string | null
          summary?: string | null
          title: string
        }
        Update: {
          body_markdown?: string | null
          change_note?: string | null
          created_at?: string | null
          created_by?: string | null
          form_data?: Json | null
          id?: string
          proposal_id?: string
          revision_number?: number
          status_at_save?: string | null
          summary?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_proposal_revisions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "client_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      client_proposal_share_links: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string
          first_viewed_at: string | null
          id: string
          last_viewed_at: string | null
          proposal_id: string
          revision_id: string
          revoked_at: string | null
          revoked_by: string | null
          token_hash: string
          updated_at: string
          view_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at: string
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          proposal_id: string
          revision_id: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash: string
          updated_at?: string
          view_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string
          first_viewed_at?: string | null
          id?: string
          last_viewed_at?: string | null
          proposal_id?: string
          revision_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash?: string
          updated_at?: string
          view_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_proposal_share_links_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "client_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_proposal_share_links_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "client_proposal_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      client_proposal_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          form_data: Json
          id: string
          is_archived: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          form_data: Json
          id?: string
          is_archived?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          form_data?: Json
          id?: string
          is_archived?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      client_proposals: {
        Row: {
          acceptance_ip: string | null
          accepted_at: string | null
          accepted_by_email: string | null
          accepted_by_name: string | null
          accepted_revision_id: string | null
          body_markdown: string | null
          client_id: string | null
          created_at: string | null
          created_by: string | null
          current_revision: number
          decline_reason: string | null
          declined_at: string | null
          form_data: Json | null
          id: string
          owner: string | null
          proposal_number: string | null
          proposal_value: number | null
          status: string
          summary: string | null
          title: string
          updated_at: string | null
          valid_until: string | null
        }
        Insert: {
          acceptance_ip?: string | null
          accepted_at?: string | null
          accepted_by_email?: string | null
          accepted_by_name?: string | null
          accepted_revision_id?: string | null
          body_markdown?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_revision?: number
          decline_reason?: string | null
          declined_at?: string | null
          form_data?: Json | null
          id?: string
          owner?: string | null
          proposal_number?: string | null
          proposal_value?: number | null
          status?: string
          summary?: string | null
          title: string
          updated_at?: string | null
          valid_until?: string | null
        }
        Update: {
          acceptance_ip?: string | null
          accepted_at?: string | null
          accepted_by_email?: string | null
          accepted_by_name?: string | null
          accepted_revision_id?: string | null
          body_markdown?: string | null
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_revision?: number
          decline_reason?: string | null
          declined_at?: string | null
          form_data?: Json | null
          id?: string
          owner?: string | null
          proposal_number?: string | null
          proposal_value?: number | null
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_proposals_accepted_revision_id_fkey"
            columns: ["accepted_revision_id"]
            isOneToOne: false
            referencedRelation: "client_proposal_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_proposals_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_clients"
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
      company_client_contacts: {
        Row: {
          client_id: string
          created_at: string
          email: string
          id: string
          is_primary: boolean
          name: string
          notes: string
          phone: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          email?: string
          id?: string
          is_primary?: boolean
          name: string
          notes?: string
          phone?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          email?: string
          id?: string
          is_primary?: boolean
          name?: string
          notes?: string
          phone?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      company_clients: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          client_code: string | null
          company_type: string | null
          contact_name: string | null
          country: string | null
          created_at: string | null
          email: string | null
          id: string
          lifecycle_stage: string
          name: string
          notes: string | null
          owner: string | null
          phone: string | null
          postal_code: string | null
          proposal_seq: number
          source: string | null
          state: string | null
          status: string
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          client_code?: string | null
          company_type?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          lifecycle_stage?: string
          name: string
          notes?: string | null
          owner?: string | null
          phone?: string | null
          postal_code?: string | null
          proposal_seq?: number
          source?: string | null
          state?: string | null
          status?: string
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          client_code?: string | null
          company_type?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          lifecycle_stage?: string
          name?: string
          notes?: string | null
          owner?: string | null
          phone?: string | null
          postal_code?: string | null
          proposal_seq?: number
          source?: string | null
          state?: string | null
          status?: string
          updated_at?: string | null
          website?: string | null
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
      dev_agent_memory: {
        Row: {
          agent_id: string | null
          content: string | null
          created_at: string | null
          created_by: string | null
          id: string
          kind: string | null
          status: string
          structured: Json
          tags: string[]
          task_id: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          kind?: string | null
          status?: string
          structured?: Json
          tags?: string[]
          task_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          kind?: string | null
          status?: string
          structured?: Json
          tags?: string[]
          task_id?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_agent_memory_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "dev_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_agent_memory_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "dev_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_agent_messages: {
        Row: {
          agent_id: string | null
          content: string | null
          created_at: string | null
          id: string
          role: string | null
          run_id: string | null
          seq: number
          structured: Json
          task_id: string | null
        }
        Insert: {
          agent_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          role?: string | null
          run_id?: string | null
          seq?: number
          structured?: Json
          task_id?: string | null
        }
        Update: {
          agent_id?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          role?: string | null
          run_id?: string | null
          seq?: number
          structured?: Json
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_agent_messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "dev_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_agent_messages_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "dev_agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_agent_messages_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "dev_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_agent_runs: {
        Row: {
          agent_id: string | null
          created_at: string | null
          error: string | null
          finished_at: string | null
          id: string
          input: Json
          model: string | null
          output: Json
          phase: string | null
          started_at: string | null
          status: string
          task_id: string | null
          tokens_used: number | null
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          model?: string | null
          output?: Json
          phase?: string | null
          started_at?: string | null
          status?: string
          task_id?: string | null
          tokens_used?: number | null
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          model?: string | null
          output?: Json
          phase?: string | null
          started_at?: string | null
          status?: string
          task_id?: string | null
          tokens_used?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "dev_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_agent_runs_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "dev_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_agents: {
        Row: {
          allowed_tools: string[]
          created_at: string | null
          description: string | null
          id: string
          is_manager: boolean
          key: string
          model: string | null
          name: string
          restrictions: string[]
          role: string
          sort_order: number
          status: string
          system_prompt: string | null
          updated_at: string | null
        }
        Insert: {
          allowed_tools?: string[]
          created_at?: string | null
          description?: string | null
          id?: string
          is_manager?: boolean
          key: string
          model?: string | null
          name: string
          restrictions?: string[]
          role: string
          sort_order?: number
          status?: string
          system_prompt?: string | null
          updated_at?: string | null
        }
        Update: {
          allowed_tools?: string[]
          created_at?: string | null
          description?: string | null
          id?: string
          is_manager?: boolean
          key?: string
          model?: string | null
          name?: string
          restrictions?: string[]
          role?: string
          sort_order?: number
          status?: string
          system_prompt?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      dev_approvals: {
        Row: {
          affected_files: Json
          affected_tables: Json
          approval_type: string
          created_at: string | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          experience_impact: string | null
          id: string
          plain_english_summary: string | null
          requested_by: string | null
          risk_level: string
          status: string
          summary: string | null
          target_id: string | null
          target_type: string | null
          task_id: string | null
          technical_summary: string | null
          updated_at: string | null
        }
        Insert: {
          affected_files?: Json
          affected_tables?: Json
          approval_type: string
          created_at?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          experience_impact?: string | null
          id?: string
          plain_english_summary?: string | null
          requested_by?: string | null
          risk_level?: string
          status?: string
          summary?: string | null
          target_id?: string | null
          target_type?: string | null
          task_id?: string | null
          technical_summary?: string | null
          updated_at?: string | null
        }
        Update: {
          affected_files?: Json
          affected_tables?: Json
          approval_type?: string
          created_at?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          experience_impact?: string | null
          id?: string
          plain_english_summary?: string | null
          requested_by?: string | null
          risk_level?: string
          status?: string
          summary?: string | null
          target_id?: string | null
          target_type?: string | null
          task_id?: string | null
          technical_summary?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_approvals_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "dev_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_artifacts: {
        Row: {
          artifact_type: string | null
          content: string | null
          created_at: string | null
          created_by: string | null
          id: string
          kind: string | null
          path: string | null
          run_id: string | null
          status: string
          task_id: string | null
          title: string | null
          updated_at: string | null
          version: number
        }
        Insert: {
          artifact_type?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          kind?: string | null
          path?: string | null
          run_id?: string | null
          status?: string
          task_id?: string | null
          title?: string | null
          updated_at?: string | null
          version?: number
        }
        Update: {
          artifact_type?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          kind?: string | null
          path?: string | null
          run_id?: string | null
          status?: string
          task_id?: string | null
          title?: string | null
          updated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "dev_artifacts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "dev_agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_artifacts_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "dev_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          agent_id: string | null
          created_at: string | null
          detail: Json
          entity: string | null
          entity_id: string | null
          id: string
          risk_level: string
          task_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type: string
          agent_id?: string | null
          created_at?: string | null
          detail?: Json
          entity?: string | null
          entity_id?: string | null
          id?: string
          risk_level?: string
          task_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          agent_id?: string | null
          created_at?: string | null
          detail?: Json
          entity?: string | null
          entity_id?: string | null
          id?: string
          risk_level?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_audit_log_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "dev_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_audit_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "dev_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_code_reviews: {
        Row: {
          artifact_id: string | null
          created_at: string | null
          findings: Json
          id: string
          reviewer_agent_id: string | null
          risk_level: string
          run_id: string | null
          status: string
          summary: string | null
          task_id: string | null
          updated_at: string | null
          verdict: string
        }
        Insert: {
          artifact_id?: string | null
          created_at?: string | null
          findings?: Json
          id?: string
          reviewer_agent_id?: string | null
          risk_level?: string
          run_id?: string | null
          status?: string
          summary?: string | null
          task_id?: string | null
          updated_at?: string | null
          verdict?: string
        }
        Update: {
          artifact_id?: string | null
          created_at?: string | null
          findings?: Json
          id?: string
          reviewer_agent_id?: string | null
          risk_level?: string
          run_id?: string | null
          status?: string
          summary?: string | null
          task_id?: string | null
          updated_at?: string | null
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_code_reviews_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "dev_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_code_reviews_reviewer_agent_id_fkey"
            columns: ["reviewer_agent_id"]
            isOneToOne: false
            referencedRelation: "dev_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_code_reviews_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "dev_agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_code_reviews_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "dev_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_deployments: {
        Row: {
          approval_id: string | null
          branch: string | null
          commit_sha: string | null
          created_at: string | null
          created_by: string | null
          environment: string
          id: string
          notes: string | null
          pr_number: number | null
          preview_url: string | null
          pull_request_url: string | null
          release_tag: string | null
          status: string
          task_id: string | null
          updated_at: string | null
        }
        Insert: {
          approval_id?: string | null
          branch?: string | null
          commit_sha?: string | null
          created_at?: string | null
          created_by?: string | null
          environment?: string
          id?: string
          notes?: string | null
          pr_number?: number | null
          preview_url?: string | null
          pull_request_url?: string | null
          release_tag?: string | null
          status?: string
          task_id?: string | null
          updated_at?: string | null
        }
        Update: {
          approval_id?: string | null
          branch?: string | null
          commit_sha?: string | null
          created_at?: string | null
          created_by?: string | null
          environment?: string
          id?: string
          notes?: string | null
          pr_number?: number | null
          preview_url?: string | null
          pull_request_url?: string | null
          release_tag?: string | null
          status?: string
          task_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_deployments_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "dev_approvals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_deployments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "dev_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_experience_reviews: {
        Row: {
          created_at: string | null
          findings: Json
          id: string
          perspective: string | null
          reviewer_agent_id: string | null
          run_id: string | null
          score: number | null
          status: string
          summary: string | null
          task_id: string | null
          updated_at: string | null
          verdict: string
        }
        Insert: {
          created_at?: string | null
          findings?: Json
          id?: string
          perspective?: string | null
          reviewer_agent_id?: string | null
          run_id?: string | null
          score?: number | null
          status?: string
          summary?: string | null
          task_id?: string | null
          updated_at?: string | null
          verdict?: string
        }
        Update: {
          created_at?: string | null
          findings?: Json
          id?: string
          perspective?: string | null
          reviewer_agent_id?: string | null
          run_id?: string | null
          score?: number | null
          status?: string
          summary?: string | null
          task_id?: string | null
          updated_at?: string | null
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_experience_reviews_reviewer_agent_id_fkey"
            columns: ["reviewer_agent_id"]
            isOneToOne: false
            referencedRelation: "dev_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_experience_reviews_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "dev_agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_experience_reviews_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "dev_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_feedback: {
        Row: {
          category: string | null
          created_at: string | null
          created_by: string | null
          id: string
          message: string
          resolved_at: string | null
          resolved_by: string | null
          risk_level: string
          screen: string | null
          status: string
          task_id: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          message: string
          resolved_at?: string | null
          resolved_by?: string | null
          risk_level?: string
          screen?: string | null
          status?: string
          task_id?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          message?: string
          resolved_at?: string | null
          resolved_by?: string | null
          risk_level?: string
          screen?: string | null
          status?: string
          task_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_feedback_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "dev_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_file_change_plans: {
        Row: {
          applied_at: string | null
          artifact_id: string | null
          change_type: string
          created_at: string | null
          diff: string | null
          file_path: string
          id: string
          language: string | null
          rationale: string | null
          risk_level: string
          status: string
          task_id: string | null
          updated_at: string | null
        }
        Insert: {
          applied_at?: string | null
          artifact_id?: string | null
          change_type: string
          created_at?: string | null
          diff?: string | null
          file_path: string
          id?: string
          language?: string | null
          rationale?: string | null
          risk_level?: string
          status?: string
          task_id?: string | null
          updated_at?: string | null
        }
        Update: {
          applied_at?: string | null
          artifact_id?: string | null
          change_type?: string
          created_at?: string | null
          diff?: string | null
          file_path?: string
          id?: string
          language?: string | null
          rationale?: string | null
          risk_level?: string
          status?: string
          task_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_file_change_plans_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "dev_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_file_change_plans_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "dev_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_security_reviews: {
        Row: {
          created_at: string | null
          findings: Json
          id: string
          reviewer_agent_id: string | null
          risk_level: string
          run_id: string | null
          status: string
          summary: string | null
          task_id: string | null
          updated_at: string | null
          verdict: string
        }
        Insert: {
          created_at?: string | null
          findings?: Json
          id?: string
          reviewer_agent_id?: string | null
          risk_level?: string
          run_id?: string | null
          status?: string
          summary?: string | null
          task_id?: string | null
          updated_at?: string | null
          verdict?: string
        }
        Update: {
          created_at?: string | null
          findings?: Json
          id?: string
          reviewer_agent_id?: string | null
          risk_level?: string
          run_id?: string | null
          status?: string
          summary?: string | null
          task_id?: string | null
          updated_at?: string | null
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "dev_security_reviews_reviewer_agent_id_fkey"
            columns: ["reviewer_agent_id"]
            isOneToOne: false
            referencedRelation: "dev_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_security_reviews_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "dev_agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_security_reviews_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "dev_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_tasks: {
        Row: {
          created_at: string | null
          created_by: string | null
          database_changes_allowed: boolean
          deployment_allowed: boolean
          description: string | null
          file_changes_allowed: boolean
          github_branch_allowed: boolean
          human_approval_required: boolean
          id: string
          metadata: Json
          priority: string
          risk_level: string
          stage: string
          status: string
          target_area: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          database_changes_allowed?: boolean
          deployment_allowed?: boolean
          description?: string | null
          file_changes_allowed?: boolean
          github_branch_allowed?: boolean
          human_approval_required?: boolean
          id?: string
          metadata?: Json
          priority?: string
          risk_level?: string
          stage?: string
          status?: string
          target_area?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          database_changes_allowed?: boolean
          deployment_allowed?: boolean
          description?: string | null
          file_changes_allowed?: boolean
          github_branch_allowed?: boolean
          human_approval_required?: boolean
          id?: string
          metadata?: Json
          priority?: string
          risk_level?: string
          stage?: string
          status?: string
          target_area?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      dev_test_results: {
        Row: {
          created_at: string | null
          details: Json
          failed: number
          id: string
          kind: string | null
          log: string | null
          passed: number
          run_id: string | null
          skipped: number
          status: string
          summary: string | null
          task_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          details?: Json
          failed?: number
          id?: string
          kind?: string | null
          log?: string | null
          passed?: number
          run_id?: string | null
          skipped?: number
          status?: string
          summary?: string | null
          task_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          details?: Json
          failed?: number
          id?: string
          kind?: string | null
          log?: string | null
          passed?: number
          run_id?: string | null
          skipped?: number
          status?: string
          summary?: string | null
          task_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_test_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "dev_agent_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dev_test_results_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "dev_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_tool_permissions: {
        Row: {
          agent_id: string | null
          allowed: boolean
          created_at: string | null
          id: string
          notes: string | null
          requires_approval: boolean
          scope: Json
          tool: string
          updated_at: string | null
        }
        Insert: {
          agent_id?: string | null
          allowed?: boolean
          created_at?: string | null
          id?: string
          notes?: string | null
          requires_approval?: boolean
          scope?: Json
          tool: string
          updated_at?: string | null
        }
        Update: {
          agent_id?: string | null
          allowed?: boolean
          created_at?: string | null
          id?: string
          notes?: string | null
          requires_approval?: boolean
          scope?: Json
          tool?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dev_tool_permissions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "dev_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      document_builder_drafts: {
        Row: {
          body_markdown: string | null
          company_document_id: string | null
          confidence_level: string | null
          created_at: string | null
          created_by: string | null
          doc_type: string
          generation_id: string | null
          human_review_required: boolean | null
          id: string
          last_reviewed_at: string | null
          review_reason: string | null
          review_status: string
          reviewed_by: string | null
          sections: Json
          title: string
          updated_at: string | null
        }
        Insert: {
          body_markdown?: string | null
          company_document_id?: string | null
          confidence_level?: string | null
          created_at?: string | null
          created_by?: string | null
          doc_type: string
          generation_id?: string | null
          human_review_required?: boolean | null
          id?: string
          last_reviewed_at?: string | null
          review_reason?: string | null
          review_status?: string
          reviewed_by?: string | null
          sections?: Json
          title: string
          updated_at?: string | null
        }
        Update: {
          body_markdown?: string | null
          company_document_id?: string | null
          confidence_level?: string | null
          created_at?: string | null
          created_by?: string | null
          doc_type?: string
          generation_id?: string | null
          human_review_required?: boolean | null
          id?: string
          last_reviewed_at?: string | null
          review_reason?: string | null
          review_status?: string
          reviewed_by?: string | null
          sections?: Json
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_builder_drafts_company_document_id_fkey"
            columns: ["company_document_id"]
            isOneToOne: false
            referencedRelation: "company_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_builder_drafts_generation_id_fkey"
            columns: ["generation_id"]
            isOneToOne: false
            referencedRelation: "document_builder_generations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_builder_generations: {
        Row: {
          completed_at: string | null
          created_at: string | null
          doc_type: string
          error_message: string | null
          gateway_status: string | null
          id: string
          inputs: Json | null
          status: string
          title: string
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          doc_type: string
          error_message?: string | null
          gateway_status?: string | null
          id?: string
          inputs?: Json | null
          status?: string
          title: string
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          doc_type?: string
          error_message?: string | null
          gateway_status?: string | null
          id?: string
          inputs?: Json | null
          status?: string
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      document_shares: {
        Row: {
          created_at: string | null
          document_id: string
          id: string
          note: string | null
          permission: string
          revoked: boolean | null
          revoked_at: string | null
          shared_by: string | null
          shared_with_user_id: string
        }
        Insert: {
          created_at?: string | null
          document_id: string
          id?: string
          note?: string | null
          permission?: string
          revoked?: boolean | null
          revoked_at?: string | null
          shared_by?: string | null
          shared_with_user_id: string
        }
        Update: {
          created_at?: string | null
          document_id?: string
          id?: string
          note?: string | null
          permission?: string
          revoked?: boolean | null
          revoked_at?: string | null
          shared_by?: string | null
          shared_with_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_shares_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "company_documents"
            referencedColumns: ["id"]
          },
        ]
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
      employee_time_off_balances: {
        Row: {
          accrued_hours: number
          carryover_hours: number
          created_at: string
          id: string
          leave_type: string
          policy_year: number
          updated_at: string
          used_hours: number
          user_id: string
        }
        Insert: {
          accrued_hours?: number
          carryover_hours?: number
          created_at?: string
          id?: string
          leave_type: string
          policy_year: number
          updated_at?: string
          used_hours?: number
          user_id: string
        }
        Update: {
          accrued_hours?: number
          carryover_hours?: number
          created_at?: string
          id?: string
          leave_type?: string
          policy_year?: number
          updated_at?: string
          used_hours?: number
          user_id?: string
        }
        Relationships: []
      }
      employee_time_off_policies: {
        Row: {
          active: boolean
          annual_hours: number
          carryover_cap_hours: number
          created_at: string
          id: string
          is_paid: boolean
          label: string
          leave_type: string
          requires_approval: boolean
          updated_at: string
        }
        Insert: {
          active?: boolean
          annual_hours?: number
          carryover_cap_hours?: number
          created_at?: string
          id?: string
          is_paid?: boolean
          label: string
          leave_type: string
          requires_approval?: boolean
          updated_at?: string
        }
        Update: {
          active?: boolean
          annual_hours?: number
          carryover_cap_hours?: number
          created_at?: string
          id?: string
          is_paid?: boolean
          label?: string
          leave_type?: string
          requires_approval?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      employee_time_off_requests: {
        Row: {
          calendar_event_id: string | null
          created_at: string
          end_date: string
          hours_requested: number
          id: string
          leave_type: string
          reason: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          calendar_event_id?: string | null
          created_at?: string
          end_date: string
          hours_requested: number
          id?: string
          leave_type: string
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          calendar_event_id?: string | null
          created_at?: string
          end_date?: string
          hours_requested?: number
          id?: string
          leave_type?: string
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_time_off_requests_calendar_event_id_fkey"
            columns: ["calendar_event_id"]
            isOneToOne: false
            referencedRelation: "employee_calendar_events"
            referencedColumns: ["id"]
          },
        ]
      }
      gap_analysis_results: {
        Row: {
          company_id: string | null
          created_at: string | null
          existing_item: string | null
          finding: string | null
          gap_description: string | null
          human_review_required: boolean | null
          id: string
          module_assignment: string | null
          project_id: string | null
          recommended_update: string | null
          research_run_id: string | null
          risk_level: string | null
          source_url: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          existing_item?: string | null
          finding?: string | null
          gap_description?: string | null
          human_review_required?: boolean | null
          id?: string
          module_assignment?: string | null
          project_id?: string | null
          recommended_update?: string | null
          research_run_id?: string | null
          risk_level?: string | null
          source_url?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          existing_item?: string | null
          finding?: string | null
          gap_description?: string | null
          human_review_required?: boolean | null
          id?: string
          module_assignment?: string | null
          project_id?: string | null
          recommended_update?: string | null
          research_run_id?: string | null
          risk_level?: string | null
          source_url?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gap_analysis_results_research_run_id_fkey"
            columns: ["research_run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
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
      lead_triage_results: {
        Row: {
          acted_at: string | null
          acted_by: string | null
          confidence: string
          created_at: string
          human_review_required: boolean
          id: string
          lead_id: string
          next_step: string
          priority_rank: number
          priority_score: number
          rationale: string | null
          run_id: string
          segment: string | null
          status: string
          updated_at: string
        }
        Insert: {
          acted_at?: string | null
          acted_by?: string | null
          confidence?: string
          created_at?: string
          human_review_required?: boolean
          id?: string
          lead_id: string
          next_step: string
          priority_rank: number
          priority_score?: number
          rationale?: string | null
          run_id: string
          segment?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          acted_at?: string | null
          acted_by?: string | null
          confidence?: string
          created_at?: string
          human_review_required?: boolean
          id?: string
          lead_id?: string
          next_step?: string
          priority_rank?: number
          priority_score?: number
          rationale?: string | null
          run_id?: string
          segment?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_triage_results_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "demo_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_triage_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "lead_triage_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_triage_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          gateway_status: string | null
          id: string
          leads_analyzed: number
          model: string | null
          run_date: string
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          gateway_status?: string | null
          id?: string
          leads_analyzed?: number
          model?: string | null
          run_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          gateway_status?: string | null
          id?: string
          leads_analyzed?: number
          model?: string | null
          run_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      legal_prompt_templates: {
        Row: {
          created_at: string | null
          id: string
          name: string
          requires_human_review: boolean | null
          template_key: string
          template_text: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          requires_human_review?: boolean | null
          template_key: string
          template_text: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          requires_human_review?: boolean | null
          template_key?: string
          template_text?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      legal_register_change_log: {
        Row: {
          change_reason: string | null
          change_type: string
          changed_by: string | null
          company_id: string | null
          created_at: string | null
          entry_id: string | null
          id: string
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          change_reason?: string | null
          change_type: string
          changed_by?: string | null
          company_id?: string | null
          created_at?: string | null
          entry_id?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          change_reason?: string | null
          change_type?: string
          changed_by?: string | null
          company_id?: string | null
          created_at?: string | null
          entry_id?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: []
      }
      legal_register_items: {
        Row: {
          ai_research_query: string | null
          ai_researched: boolean | null
          applicability_notes: string | null
          applicability_status: string | null
          applies_to_us: boolean | null
          archived: boolean | null
          category: string
          citation: string | null
          company_id: string | null
          compliance_requirements: string | null
          compliance_status: string
          confidence_level: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          documentation_required: string | null
          effective_date: string | null
          human_review_required: boolean | null
          id: string
          industry_sectors: string[] | null
          inspection_required: string | null
          issuing_body: string | null
          jurisdiction: string
          jurisdiction_state: string | null
          last_reviewed_at: string | null
          last_updated_from_source: string | null
          module_assignment: string | null
          owner_user_id: string | null
          penalties: string | null
          permit_required: string | null
          program: string | null
          project_id: string | null
          record_retention: string | null
          required_action: string | null
          requirement_type: string | null
          research_run_id: string | null
          responsible_role: string | null
          review_date: string | null
          review_role_needed: string | null
          review_status: string | null
          reviewed_by: string | null
          risk_level: string | null
          source_notes: string | null
          source_urls: string[] | null
          title: string
          training_required: string | null
          updated_at: string | null
        }
        Insert: {
          ai_research_query?: string | null
          ai_researched?: boolean | null
          applicability_notes?: string | null
          applicability_status?: string | null
          applies_to_us?: boolean | null
          archived?: boolean | null
          category?: string
          citation?: string | null
          company_id?: string | null
          compliance_requirements?: string | null
          compliance_status?: string
          confidence_level?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          documentation_required?: string | null
          effective_date?: string | null
          human_review_required?: boolean | null
          id?: string
          industry_sectors?: string[] | null
          inspection_required?: string | null
          issuing_body?: string | null
          jurisdiction?: string
          jurisdiction_state?: string | null
          last_reviewed_at?: string | null
          last_updated_from_source?: string | null
          module_assignment?: string | null
          owner_user_id?: string | null
          penalties?: string | null
          permit_required?: string | null
          program?: string | null
          project_id?: string | null
          record_retention?: string | null
          required_action?: string | null
          requirement_type?: string | null
          research_run_id?: string | null
          responsible_role?: string | null
          review_date?: string | null
          review_role_needed?: string | null
          review_status?: string | null
          reviewed_by?: string | null
          risk_level?: string | null
          source_notes?: string | null
          source_urls?: string[] | null
          title: string
          training_required?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_research_query?: string | null
          ai_researched?: boolean | null
          applicability_notes?: string | null
          applicability_status?: string | null
          applies_to_us?: boolean | null
          archived?: boolean | null
          category?: string
          citation?: string | null
          company_id?: string | null
          compliance_requirements?: string | null
          compliance_status?: string
          confidence_level?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          documentation_required?: string | null
          effective_date?: string | null
          human_review_required?: boolean | null
          id?: string
          industry_sectors?: string[] | null
          inspection_required?: string | null
          issuing_body?: string | null
          jurisdiction?: string
          jurisdiction_state?: string | null
          last_reviewed_at?: string | null
          last_updated_from_source?: string | null
          module_assignment?: string | null
          owner_user_id?: string | null
          penalties?: string | null
          permit_required?: string | null
          program?: string | null
          project_id?: string | null
          record_retention?: string | null
          required_action?: string | null
          requirement_type?: string | null
          research_run_id?: string | null
          responsible_role?: string | null
          review_date?: string | null
          review_role_needed?: string | null
          review_status?: string | null
          reviewed_by?: string | null
          risk_level?: string | null
          source_notes?: string | null
          source_urls?: string[] | null
          title?: string
          training_required?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      legal_register_sources: {
        Row: {
          agency: string | null
          confidence_default: string | null
          created_at: string | null
          enabled: boolean | null
          id: string
          jurisdiction: string | null
          last_checked_at: string | null
          name: string
          notes: string | null
          owner_role: string | null
          source_type: string | null
          state: string | null
          updated_at: string | null
          url: string | null
        }
        Insert: {
          agency?: string | null
          confidence_default?: string | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          jurisdiction?: string | null
          last_checked_at?: string | null
          name: string
          notes?: string | null
          owner_role?: string | null
          source_type?: string | null
          state?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Update: {
          agency?: string | null
          confidence_default?: string | null
          created_at?: string | null
          enabled?: boolean | null
          id?: string
          jurisdiction?: string | null
          last_checked_at?: string | null
          name?: string
          notes?: string | null
          owner_role?: string | null
          source_type?: string | null
          state?: string | null
          updated_at?: string | null
          url?: string | null
        }
        Relationships: []
      }
      legal_research_sessions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          items_found: number | null
          items_saved: number | null
          model: string
          query: string
          researched_by: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          items_found?: number | null
          items_saved?: number | null
          model?: string
          query: string
          researched_by?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          items_found?: number | null
          items_saved?: number | null
          model?: string
          query?: string
          researched_by?: string | null
          status?: string
        }
        Relationships: []
      }
      module_recommendations: {
        Row: {
          build_status: string | null
          company_id: string | null
          created_at: string | null
          id: string
          module_name: string
          priority_level: string | null
          project_id: string | null
          reason_needed: string | null
          related_register_entries: Json | null
          required_alerts: string | null
          required_approval_workflow: string | null
          required_corrective_actions: string | null
          required_dashboards: string | null
          required_document_control: string | null
          required_forms: string | null
          required_inspections: string | null
          required_permits: string | null
          required_reports: string | null
          required_training: string | null
          research_run_id: string | null
          updated_at: string | null
        }
        Insert: {
          build_status?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          module_name: string
          priority_level?: string | null
          project_id?: string | null
          reason_needed?: string | null
          related_register_entries?: Json | null
          required_alerts?: string | null
          required_approval_workflow?: string | null
          required_corrective_actions?: string | null
          required_dashboards?: string | null
          required_document_control?: string | null
          required_forms?: string | null
          required_inspections?: string | null
          required_permits?: string | null
          required_reports?: string | null
          required_training?: string | null
          research_run_id?: string | null
          updated_at?: string | null
        }
        Update: {
          build_status?: string | null
          company_id?: string | null
          created_at?: string | null
          id?: string
          module_name?: string
          priority_level?: string | null
          project_id?: string | null
          reason_needed?: string | null
          related_register_entries?: Json | null
          required_alerts?: string | null
          required_approval_workflow?: string | null
          required_corrective_actions?: string | null
          required_dashboards?: string | null
          required_document_control?: string | null
          required_forms?: string | null
          required_inspections?: string | null
          required_permits?: string | null
          required_reports?: string | null
          required_training?: string | null
          research_run_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "module_recommendations_research_run_id_fkey"
            columns: ["research_run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
        ]
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
      platform_company_profile: {
        Row: {
          address_line1: string
          address_line2: string
          city: string
          country: string
          display_name: string
          email: string
          id: boolean
          legal_name: string
          phone: string
          postal_code: string
          state: string
          updated_at: string
          updated_by: string | null
          website: string
        }
        Insert: {
          address_line1?: string
          address_line2?: string
          city?: string
          country?: string
          display_name?: string
          email?: string
          id?: boolean
          legal_name?: string
          phone?: string
          postal_code?: string
          state?: string
          updated_at?: string
          updated_by?: string | null
          website?: string
        }
        Update: {
          address_line1?: string
          address_line2?: string
          city?: string
          country?: string
          display_name?: string
          email?: string
          id?: boolean
          legal_name?: string
          phone?: string
          postal_code?: string
          state?: string
          updated_at?: string
          updated_by?: string | null
          website?: string
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
      proposal_team_bios: {
        Row: {
          bio: string
          created_at: string
          display_name: string
          is_publishable: boolean
          signature_bucket: string | null
          signature_path: string | null
          signature_updated_at: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string
          created_at?: string
          display_name?: string
          is_publishable?: boolean
          signature_bucket?: string | null
          signature_path?: string | null
          signature_updated_at?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string
          created_at?: string
          display_name?: string
          is_publishable?: boolean
          signature_bucket?: string | null
          signature_path?: string | null
          signature_updated_at?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      research_runs: {
        Row: {
          chemicals_materials: string | null
          company_id: string | null
          completed_at: string | null
          contractor_type: string | null
          created_at: string | null
          critical_risk_count: number | null
          employee_type: string | null
          equipment: string | null
          error_message: string | null
          high_risk_count: number | null
          id: string
          industry: string | null
          jurisdiction: string | null
          needs_review_count: number | null
          program: string | null
          project_id: string | null
          query: string
          result_summary: string | null
          risk_level: string | null
          scope: string | null
          state: string | null
          status: string
          title: string | null
          total_findings: number | null
          updated_at: string | null
          user_id: string | null
          vehicle_type: string | null
          work_activity: string | null
        }
        Insert: {
          chemicals_materials?: string | null
          company_id?: string | null
          completed_at?: string | null
          contractor_type?: string | null
          created_at?: string | null
          critical_risk_count?: number | null
          employee_type?: string | null
          equipment?: string | null
          error_message?: string | null
          high_risk_count?: number | null
          id?: string
          industry?: string | null
          jurisdiction?: string | null
          needs_review_count?: number | null
          program?: string | null
          project_id?: string | null
          query: string
          result_summary?: string | null
          risk_level?: string | null
          scope?: string | null
          state?: string | null
          status?: string
          title?: string | null
          total_findings?: number | null
          updated_at?: string | null
          user_id?: string | null
          vehicle_type?: string | null
          work_activity?: string | null
        }
        Update: {
          chemicals_materials?: string | null
          company_id?: string | null
          completed_at?: string | null
          contractor_type?: string | null
          created_at?: string | null
          critical_risk_count?: number | null
          employee_type?: string | null
          equipment?: string | null
          error_message?: string | null
          high_risk_count?: number | null
          id?: string
          industry?: string | null
          jurisdiction?: string | null
          needs_review_count?: number | null
          program?: string | null
          project_id?: string | null
          query?: string
          result_summary?: string | null
          risk_level?: string | null
          scope?: string | null
          state?: string | null
          status?: string
          title?: string | null
          total_findings?: number | null
          updated_at?: string | null
          user_id?: string | null
          vehicle_type?: string | null
          work_activity?: string | null
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
      talent_activity_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          agent_name: string | null
          candidate_id: string | null
          created_at: string | null
          id: string
          job_order_id: string | null
          match_id: string | null
          summary: string
          tier: number | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type: string
          agent_name?: string | null
          candidate_id?: string | null
          created_at?: string | null
          id?: string
          job_order_id?: string | null
          match_id?: string | null
          summary: string
          tier?: number | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          agent_name?: string | null
          candidate_id?: string | null
          created_at?: string | null
          id?: string
          job_order_id?: string | null
          match_id?: string | null
          summary?: string
          tier?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_activity_log_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "talent_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_activity_log_job_order_id_fkey"
            columns: ["job_order_id"]
            isOneToOne: false
            referencedRelation: "talent_job_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_activity_log_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "talent_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_candidate_certifications: {
        Row: {
          candidate_id: string
          certification: string
          created_at: string
          expires_on: string | null
          id: string
          issued_on: string | null
          updated_at: string
        }
        Insert: {
          candidate_id: string
          certification: string
          created_at?: string
          expires_on?: string | null
          id?: string
          issued_on?: string | null
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          certification?: string
          created_at?: string
          expires_on?: string | null
          id?: string
          issued_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_candidate_certifications_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "talent_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_candidates: {
        Row: {
          availability_date: string | null
          cert_expiry_date: string | null
          certifications: string[]
          created_at: string | null
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          location: string | null
          notes: string | null
          pay_expectation: number | null
          phone: string | null
          status: string
          updated_at: string | null
          verified_certifications: string[]
          verticals: string[]
          willing_to_relocate: boolean
          years_experience: number | null
        }
        Insert: {
          availability_date?: string | null
          cert_expiry_date?: string | null
          certifications?: string[]
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          location?: string | null
          notes?: string | null
          pay_expectation?: number | null
          phone?: string | null
          status?: string
          updated_at?: string | null
          verified_certifications?: string[]
          verticals?: string[]
          willing_to_relocate?: boolean
          years_experience?: number | null
        }
        Update: {
          availability_date?: string | null
          cert_expiry_date?: string | null
          certifications?: string[]
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          location?: string | null
          notes?: string | null
          pay_expectation?: number | null
          phone?: string | null
          status?: string
          updated_at?: string | null
          verified_certifications?: string[]
          verticals?: string[]
          willing_to_relocate?: boolean
          years_experience?: number | null
        }
        Relationships: []
      }
      talent_commission_plans: {
        Row: {
          active: boolean
          base_salary: number
          commission_pct: number
          created_at: string
          id: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          base_salary?: number
          commission_pct?: number
          created_at?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          base_salary?: number
          commission_pct?: number
          created_at?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      talent_job_orders: {
        Row: {
          bill_rate: number | null
          cert_requirements: string[]
          client_id: string | null
          created_at: string | null
          created_by: string | null
          id: string
          location: string | null
          min_spread: number | null
          notes: string | null
          openings: number
          priority: string
          start_date: string | null
          status: string
          title: string
          updated_at: string | null
          vertical: string | null
        }
        Insert: {
          bill_rate?: number | null
          cert_requirements?: string[]
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          location?: string | null
          min_spread?: number | null
          notes?: string | null
          openings?: number
          priority?: string
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string | null
          vertical?: string | null
        }
        Update: {
          bill_rate?: number | null
          cert_requirements?: string[]
          client_id?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          location?: string | null
          min_spread?: number | null
          notes?: string | null
          openings?: number
          priority?: string
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string | null
          vertical?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_job_orders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "company_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_match_approvals: {
        Row: {
          bill_rate_after: number | null
          bill_rate_before: number | null
          decided_at: string
          decision: string
          id: string
          match_id: string
          note: string | null
          pay_rate_after: number | null
          pay_rate_before: number | null
          reviewer_id: string | null
          reviewer_role: string | null
        }
        Insert: {
          bill_rate_after?: number | null
          bill_rate_before?: number | null
          decided_at?: string
          decision: string
          id?: string
          match_id: string
          note?: string | null
          pay_rate_after?: number | null
          pay_rate_before?: number | null
          reviewer_id?: string | null
          reviewer_role?: string | null
        }
        Update: {
          bill_rate_after?: number | null
          bill_rate_before?: number | null
          decided_at?: string
          decision?: string
          id?: string
          match_id?: string
          note?: string | null
          pay_rate_after?: number | null
          pay_rate_before?: number | null
          reviewer_id?: string | null
          reviewer_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_match_approvals_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "talent_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_matches: {
        Row: {
          ai_confidence: number | null
          ai_recommendation: string | null
          bill_rate: number
          candidate_id: string
          created_at: string | null
          created_by: string | null
          decided_at: string | null
          fit_score: number
          floor_ok: boolean
          id: string
          job_order_id: string
          markup_pct: number
          pay_rate: number
          proposed_pay_rate: number | null
          requires_human_review: boolean
          spread: number
          status: string
          updated_at: string | null
        }
        Insert: {
          ai_confidence?: number | null
          ai_recommendation?: string | null
          bill_rate?: number
          candidate_id: string
          created_at?: string | null
          created_by?: string | null
          decided_at?: string | null
          fit_score?: number
          floor_ok?: boolean
          id?: string
          job_order_id: string
          markup_pct?: number
          pay_rate?: number
          proposed_pay_rate?: number | null
          requires_human_review?: boolean
          spread?: number
          status?: string
          updated_at?: string | null
        }
        Update: {
          ai_confidence?: number | null
          ai_recommendation?: string | null
          bill_rate?: number
          candidate_id?: string
          created_at?: string | null
          created_by?: string | null
          decided_at?: string | null
          fit_score?: number
          floor_ok?: boolean
          id?: string
          job_order_id?: string
          markup_pct?: number
          pay_rate?: number
          proposed_pay_rate?: number | null
          requires_human_review?: boolean
          spread?: number
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_matches_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "talent_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_matches_job_order_id_fkey"
            columns: ["job_order_id"]
            isOneToOne: false
            referencedRelation: "talent_job_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_placements: {
        Row: {
          bill_rate: number
          candidate_id: string
          created_at: string | null
          created_by: string | null
          end_date: string | null
          id: string
          job_order_id: string
          match_id: string
          pay_rate: number
          recruiter_id: string | null
          start_date: string
          status: string
          updated_at: string | null
        }
        Insert: {
          bill_rate: number
          candidate_id: string
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          id?: string
          job_order_id: string
          match_id: string
          pay_rate: number
          recruiter_id?: string | null
          start_date: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          bill_rate?: number
          candidate_id?: string
          created_at?: string | null
          created_by?: string | null
          end_date?: string | null
          id?: string
          job_order_id?: string
          match_id?: string
          pay_rate?: number
          recruiter_id?: string | null
          start_date?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_placements_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "talent_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_placements_job_order_id_fkey"
            columns: ["job_order_id"]
            isOneToOne: false
            referencedRelation: "talent_job_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "talent_placements_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "talent_matches"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_settings: {
        Row: {
          created_at: string | null
          default_hours_per_week: number
          id: string
          min_spread_per_hour: number
          pay_rate_autonomy_tier: number
          target_markup_pct: number
          updated_at: string | null
          updated_by: string | null
          vertical_options: string[]
        }
        Insert: {
          created_at?: string | null
          default_hours_per_week?: number
          id?: string
          min_spread_per_hour?: number
          pay_rate_autonomy_tier?: number
          target_markup_pct?: number
          updated_at?: string | null
          updated_by?: string | null
          vertical_options?: string[]
        }
        Update: {
          created_at?: string | null
          default_hours_per_week?: number
          id?: string
          min_spread_per_hour?: number
          pay_rate_autonomy_tier?: number
          target_markup_pct?: number
          updated_at?: string | null
          updated_by?: string | null
          vertical_options?: string[]
        }
        Relationships: []
      }
      talent_sourcing_leads: {
        Row: {
          certifications: string[]
          created_at: string | null
          created_record_id: string | null
          id: string
          lead_type: string
          location: string | null
          organization: string | null
          rate_signal: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          run_id: string | null
          source_url: string
          status: string
          summary: string | null
          title: string
          vertical: string | null
        }
        Insert: {
          certifications?: string[]
          created_at?: string | null
          created_record_id?: string | null
          id?: string
          lead_type: string
          location?: string | null
          organization?: string | null
          rate_signal?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_id?: string | null
          source_url: string
          status?: string
          summary?: string | null
          title: string
          vertical?: string | null
        }
        Update: {
          certifications?: string[]
          created_at?: string | null
          created_record_id?: string | null
          id?: string
          lead_type?: string
          location?: string | null
          organization?: string | null
          rate_signal?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          run_id?: string | null
          source_url?: string
          status?: string
          summary?: string | null
          title?: string
          vertical?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talent_sourcing_leads_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "talent_sourcing_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      talent_sourcing_runs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          leads_found: number
          leads_inserted: number
          query_summary: string | null
          run_type: string
          started_at: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          leads_found?: number
          leads_inserted?: number
          query_summary?: string | null
          run_type: string
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          leads_found?: number
          leads_inserted?: number
          query_summary?: string | null
          run_type?: string
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      talent_timesheets: {
        Row: {
          amount_billed: number
          amount_paid: number
          bill_rate: number
          created_at: string | null
          created_by: string | null
          hours: number
          id: string
          pay_rate: number
          placement_id: string
          status: string
          updated_at: string | null
          week_starting: string
        }
        Insert: {
          amount_billed?: number
          amount_paid?: number
          bill_rate?: number
          created_at?: string | null
          created_by?: string | null
          hours?: number
          id?: string
          pay_rate?: number
          placement_id: string
          status?: string
          updated_at?: string | null
          week_starting: string
        }
        Update: {
          amount_billed?: number
          amount_paid?: number
          bill_rate?: number
          created_at?: string | null
          created_by?: string | null
          hours?: number
          id?: string
          pay_rate?: number
          placement_id?: string
          status?: string
          updated_at?: string | null
          week_starting?: string
        }
        Relationships: [
          {
            foreignKeyName: "talent_timesheets_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "talent_placements"
            referencedColumns: ["id"]
          },
        ]
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
          can_approve_proposals: boolean
          company_id: string | null
          created_at: string | null
          role: string
          team: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          account_status?: string
          can_approve_proposals?: boolean
          company_id?: string | null
          created_at?: string | null
          role?: string
          team?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          account_status?: string
          can_approve_proposals?: boolean
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
      next_client_proposal_number: { Args: never; Returns: string }
      renumber_client_draft_proposals: { Args: { p_client: string }; Returns: number }
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
