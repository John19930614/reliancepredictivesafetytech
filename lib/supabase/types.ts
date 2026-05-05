export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
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
          checklist_item_id: string | null;
          file_path: string | null;
          file_name: string | null;
          file_type: string | null;
          status: string | null;
          owner: string | null;
          revision: string | null;
          notes: string | null;
          uploaded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          category: string;
          checklist_item_id?: string | null;
          file_path?: string | null;
          file_name?: string | null;
          file_type?: string | null;
          status?: string | null;
          owner?: string | null;
          revision?: string | null;
          notes?: string | null;
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
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
