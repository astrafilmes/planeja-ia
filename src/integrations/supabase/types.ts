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
      app_files: {
        Row: {
          bucket: string
          checksum: string | null
          created_at: string
          created_by: string | null
          file_kind: string
          id: string
          mime_type: string | null
          original_name: string
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          bucket: string
          checksum?: string | null
          created_at?: string
          created_by?: string | null
          file_kind: string
          id?: string
          mime_type?: string | null
          original_name: string
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          bucket?: string
          checksum?: string | null
          created_at?: string
          created_by?: string | null
          file_kind?: string
          id?: string
          mime_type?: string | null
          original_name?: string
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_files_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          request_payload: Json | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          request_payload?: Json | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          request_payload?: Json | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_import_dotacoes: {
        Row: {
          created_at: string
          dotacao: string
          id: string
          ignorado: boolean
          item_id: string
          job_id: string
          quantidade: number
          ref_coluna: number
          secretaria_sigla: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dotacao: string
          id?: string
          ignorado?: boolean
          item_id: string
          job_id: string
          quantidade?: number
          ref_coluna: number
          secretaria_sigla: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dotacao?: string
          id?: string
          ignorado?: boolean
          item_id?: string
          job_id?: string
          quantidade?: number
          ref_coluna?: number
          secretaria_sigla?: string
          updated_at?: string
        }
        Relationships: []
      }
      contrato_import_itens: {
        Row: {
          created_at: string
          descricao: string
          empresa: string | null
          especificacao: string | null
          excluido: boolean
          id: string
          job_id: string
          lote: string | null
          numero_item: string | null
          observacoes: string | null
          ordem_item: number | null
          source_row: number
          unidade: string | null
          updated_at: string
          valor_unitario: number
        }
        Insert: {
          created_at?: string
          descricao: string
          empresa?: string | null
          especificacao?: string | null
          excluido?: boolean
          id?: string
          job_id: string
          lote?: string | null
          numero_item?: string | null
          observacoes?: string | null
          ordem_item?: number | null
          source_row: number
          unidade?: string | null
          updated_at?: string
          valor_unitario?: number
        }
        Update: {
          created_at?: string
          descricao?: string
          empresa?: string | null
          especificacao?: string | null
          excluido?: boolean
          id?: string
          job_id?: string
          lote?: string | null
          numero_item?: string | null
          observacoes?: string | null
          ordem_item?: number | null
          source_row?: number
          unidade?: string | null
          updated_at?: string
          valor_unitario?: number
        }
        Relationships: []
      }
      contrato_import_jobs: {
        Row: {
          authorized_at: string | null
          authorized_by: string | null
          created_at: string
          created_by: string | null
          empresa: string | null
          error_message: string | null
          id: string
          linha_cabecalho: number | null
          original_filename: string
          status: string
          total_contratos_previstos: number
          total_itens: number
          total_valor: number
          updated_at: string
          upload_file_id: string | null
        }
        Insert: {
          authorized_at?: string | null
          authorized_by?: string | null
          created_at?: string
          created_by?: string | null
          empresa?: string | null
          error_message?: string | null
          id?: string
          linha_cabecalho?: number | null
          original_filename: string
          status?: string
          total_contratos_previstos?: number
          total_itens?: number
          total_valor?: number
          updated_at?: string
          upload_file_id?: string | null
        }
        Update: {
          authorized_at?: string | null
          authorized_by?: string | null
          created_at?: string
          created_by?: string | null
          empresa?: string | null
          error_message?: string | null
          id?: string
          linha_cabecalho?: number | null
          original_filename?: string
          status?: string
          total_contratos_previstos?: number
          total_itens?: number
          total_valor?: number
          updated_at?: string
          upload_file_id?: string | null
        }
        Relationships: []
      }
      contratos: {
        Row: {
          created_at: string
          created_by: string | null
          data: string | null
          data_criacao_legada: string | null
          data_texto_legado: string | null
          dotacao: string | null
          fiscal: string
          id: string
          import_job_id: string | null
          legacy_id: number | null
          link_contrato: string
          numero_contrato: string
          objeto: string
          preposto: string
          processo_id: string | null
          secretaria_id: string | null
          secretaria_nome: string
          secretaria_num: number
          secretaria_sigla: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: string | null
          data_criacao_legada?: string | null
          data_texto_legado?: string | null
          dotacao?: string | null
          fiscal: string
          id?: string
          import_job_id?: string | null
          legacy_id?: number | null
          link_contrato: string
          numero_contrato: string
          objeto: string
          preposto: string
          processo_id?: string | null
          secretaria_id?: string | null
          secretaria_nome: string
          secretaria_num: number
          secretaria_sigla: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: string | null
          data_criacao_legada?: string | null
          data_texto_legado?: string | null
          dotacao?: string | null
          fiscal?: string
          id?: string
          import_job_id?: string | null
          legacy_id?: number | null
          link_contrato?: string
          numero_contrato?: string
          objeto?: string
          preposto?: string
          processo_id?: string | null
          secretaria_id?: string | null
          secretaria_nome?: string
          secretaria_num?: number
          secretaria_sigla?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contratos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contratos_secretaria_id_fkey"
            columns: ["secretaria_id"]
            isOneToOne: false
            referencedRelation: "secretarias"
            referencedColumns: ["id"]
          },
        ]
      }
      irp_job_secretarias: {
        Row: {
          cabecalho_coluna: string
          created_at: string
          erro: string | null
          id: string
          itens_validos: number
          job_id: string
          nome: string
          numero: number
          output_file_id: string | null
          output_filename: string | null
          ref_coluna: number
          soma_valor: number
          status: string
          unidade_id: string | null
        }
        Insert: {
          cabecalho_coluna: string
          created_at?: string
          erro?: string | null
          id?: string
          itens_validos?: number
          job_id: string
          nome: string
          numero: number
          output_file_id?: string | null
          output_filename?: string | null
          ref_coluna: number
          soma_valor?: number
          status?: string
          unidade_id?: string | null
        }
        Update: {
          cabecalho_coluna?: string
          created_at?: string
          erro?: string | null
          id?: string
          itens_validos?: number
          job_id?: string
          nome?: string
          numero?: number
          output_file_id?: string | null
          output_filename?: string | null
          ref_coluna?: number
          soma_valor?: number
          status?: string
          unidade_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "irp_job_secretarias_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "irp_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irp_job_secretarias_output_file_id_fkey"
            columns: ["output_file_id"]
            isOneToOne: false
            referencedRelation: "app_files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irp_job_secretarias_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "irp_unidades_processamento"
            referencedColumns: ["id"]
          },
        ]
      }
      irp_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_message: string | null
          id: string
          idx_descricao: number | null
          idx_especificacao: number | null
          idx_natureza: number | null
          idx_unidade: number | null
          linha_cabecalho: number | null
          original_filename: string
          processo_id: string | null
          secretarias_com_itens: number
          secretarias_sem_itens: number
          started_at: string | null
          status: string
          total_linhas: number
          total_secretarias: number
          total_valor: number
          updated_at: string
          upload_file_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          idx_descricao?: number | null
          idx_especificacao?: number | null
          idx_natureza?: number | null
          idx_unidade?: number | null
          linha_cabecalho?: number | null
          original_filename: string
          processo_id?: string | null
          secretarias_com_itens?: number
          secretarias_sem_itens?: number
          started_at?: string | null
          status?: string
          total_linhas?: number
          total_secretarias?: number
          total_valor?: number
          updated_at?: string
          upload_file_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          id?: string
          idx_descricao?: number | null
          idx_especificacao?: number | null
          idx_natureza?: number | null
          idx_unidade?: number | null
          linha_cabecalho?: number | null
          original_filename?: string
          processo_id?: string | null
          secretarias_com_itens?: number
          secretarias_sem_itens?: number
          started_at?: string | null
          status?: string
          total_linhas?: number
          total_secretarias?: number
          total_valor?: number
          updated_at?: string
          upload_file_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "irp_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irp_jobs_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irp_jobs_upload_file_id_fkey"
            columns: ["upload_file_id"]
            isOneToOne: false
            referencedRelation: "app_files"
            referencedColumns: ["id"]
          },
        ]
      }
      irp_unidades_processamento: {
        Row: {
          ativa: boolean
          created_at: string
          id: string
          nome: string
          numero: number
          ordem: number
          origem_legada: boolean
          ref_coluna: number
          secretaria_id: string | null
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome: string
          numero: number
          ordem?: number
          origem_legada?: boolean
          ref_coluna: number
          secretaria_id?: string | null
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome?: string
          numero?: number
          ordem?: number
          origem_legada?: boolean
          ref_coluna?: number
          secretaria_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "irp_unidades_processamento_secretaria_id_fkey"
            columns: ["secretaria_id"]
            isOneToOne: false
            referencedRelation: "secretarias"
            referencedColumns: ["id"]
          },
        ]
      }
      numeracao: {
        Row: {
          contador: number
          secretaria_num: number
          updated_at: string
        }
        Insert: {
          contador?: number
          secretaria_num: number
          updated_at?: string
        }
        Update: {
          contador?: number
          secretaria_num?: number
          updated_at?: string
        }
        Relationships: []
      }
      processos: {
        Row: {
          ano: number | null
          created_at: string
          created_by: string | null
          data_abertura: string | null
          id: string
          modalidade: string | null
          numero_processo: string | null
          objeto: string
          observacoes: string | null
          secretaria_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ano?: number | null
          created_at?: string
          created_by?: string | null
          data_abertura?: string | null
          id?: string
          modalidade?: string | null
          numero_processo?: string | null
          objeto: string
          observacoes?: string | null
          secretaria_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ano?: number | null
          created_at?: string
          created_by?: string | null
          data_abertura?: string | null
          id?: string
          modalidade?: string | null
          numero_processo?: string | null
          objeto?: string
          observacoes?: string | null
          secretaria_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "processos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "processos_secretaria_id_fkey"
            columns: ["secretaria_id"]
            isOneToOne: false
            referencedRelation: "secretarias"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ativo: boolean
          created_at: string
          email: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          email: string
          id: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          email?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      secretarias: {
        Row: {
          ativa: boolean
          created_at: string
          id: string
          nome: string
          numero: number
          origem_legada: boolean
          sigla: string
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome: string
          numero: number
          origem_legada?: boolean
          sigla: string
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          id?: string
          nome?: string
          numero?: number
          origem_legada?: boolean
          sigla?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "gestor" | "operador" | "consulta"
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
      app_role: ["admin", "gestor", "operador", "consulta"],
    },
  },
} as const
