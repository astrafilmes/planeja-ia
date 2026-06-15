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
      contrato_atores: {
        Row: {
          contrato_id: string
          cpf: string | null
          created_at: string
          email: string | null
          id: string
          m2a_pessoa_id: string | null
          nome: string
          portaria: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          contrato_id: string
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          m2a_pessoa_id?: string | null
          nome: string
          portaria?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          contrato_id?: string
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          m2a_pessoa_id?: string | null
          nome?: string
          portaria?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_atores_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_documentos: {
        Row: {
          contrato_id: string
          created_at: string
          created_by: string | null
          hash_sha256: string | null
          id: string
          m2a_documento_id: string | null
          mime_type: string | null
          nome: string
          size_bytes: number | null
          storage_path: string
          tipo: string
          versao: number
        }
        Insert: {
          contrato_id: string
          created_at?: string
          created_by?: string | null
          hash_sha256?: string | null
          id?: string
          m2a_documento_id?: string | null
          mime_type?: string | null
          nome: string
          size_bytes?: number | null
          storage_path: string
          tipo: string
          versao?: number
        }
        Update: {
          contrato_id?: string
          created_at?: string
          created_by?: string | null
          hash_sha256?: string | null
          id?: string
          m2a_documento_id?: string | null
          mime_type?: string | null
          nome?: string
          size_bytes?: number | null
          storage_path?: string
          tipo?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "contrato_documentos_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
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
        Relationships: [
          {
            foreignKeyName: "contrato_import_dotacoes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "contrato_import_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_import_dotacoes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "contrato_import_jobs"
            referencedColumns: ["id"]
          },
        ]
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
          m2a_ata_id: string | null
          m2a_ata_numero: string | null
          m2a_fornecedor_nome: string | null
          m2a_item_id: string | null
          m2a_match_score: number
          m2a_match_status: string
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
          m2a_ata_id?: string | null
          m2a_ata_numero?: string | null
          m2a_fornecedor_nome?: string | null
          m2a_item_id?: string | null
          m2a_match_score?: number
          m2a_match_status?: string
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
          m2a_ata_id?: string | null
          m2a_ata_numero?: string | null
          m2a_fornecedor_nome?: string | null
          m2a_item_id?: string | null
          m2a_match_score?: number
          m2a_match_status?: string
          numero_item?: string | null
          observacoes?: string | null
          ordem_item?: number | null
          source_row?: number
          unidade?: string | null
          updated_at?: string
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "contrato_import_itens_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "contrato_import_jobs"
            referencedColumns: ["id"]
          },
        ]
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
          m2a_processo_id: string | null
          m2a_sync_at: string | null
          m2a_url: string | null
          original_filename: string
          processo_id: string | null
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
          m2a_processo_id?: string | null
          m2a_sync_at?: string | null
          m2a_url?: string | null
          original_filename: string
          processo_id?: string | null
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
          m2a_processo_id?: string | null
          m2a_sync_at?: string | null
          m2a_url?: string | null
          original_filename?: string
          processo_id?: string | null
          status?: string
          total_contratos_previstos?: number
          total_itens?: number
          total_valor?: number
          updated_at?: string
          upload_file_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contrato_import_jobs_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_item_dotacoes: {
        Row: {
          created_at: string
          dotacao: string
          id: string
          item_id: string
          m2a_dotacao_id: string | null
          quantidade_alocada: number
          secretaria_id: string | null
          secretaria_sigla: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dotacao: string
          id?: string
          item_id: string
          m2a_dotacao_id?: string | null
          quantidade_alocada?: number
          secretaria_id?: string | null
          secretaria_sigla: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dotacao?: string
          id?: string
          item_id?: string
          m2a_dotacao_id?: string | null
          quantidade_alocada?: number
          secretaria_id?: string | null
          secretaria_sigla?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contrato_item_dotacoes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "contrato_itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contrato_item_dotacoes_secretaria_id_fkey"
            columns: ["secretaria_id"]
            isOneToOne: false
            referencedRelation: "secretarias"
            referencedColumns: ["id"]
          },
        ]
      }
      contrato_itens: {
        Row: {
          contrato_id: string
          created_at: string
          descricao: string
          especificacao: string | null
          id: string
          lote: string | null
          m2a_item_id: string | null
          numero_item: string | null
          ordem_item: number | null
          quantidade: number
          unidade: string | null
          updated_at: string
          valor_total: number
          valor_unitario: number
        }
        Insert: {
          contrato_id: string
          created_at?: string
          descricao: string
          especificacao?: string | null
          id?: string
          lote?: string | null
          m2a_item_id?: string | null
          numero_item?: string | null
          ordem_item?: number | null
          quantidade?: number
          unidade?: string | null
          updated_at?: string
          valor_total?: number
          valor_unitario?: number
        }
        Update: {
          contrato_id?: string
          created_at?: string
          descricao?: string
          especificacao?: string | null
          id?: string
          lote?: string | null
          m2a_item_id?: string | null
          numero_item?: string | null
          ordem_item?: number | null
          quantidade?: number
          unidade?: string | null
          updated_at?: string
          valor_total?: number
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "contrato_itens_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      contratos: {
        Row: {
          created_at: string
          created_by: string | null
          data: string | null
          data_criacao_legada: string | null
          data_texto_legado: string | null
          deleted_at: string | null
          dotacao: string | null
          enviado_m2a_em: string | null
          fiscal: string
          fornecedor_nome: string | null
          id: string
          import_job_id: string | null
          impresso_assinado: boolean
          legacy_id: number | null
          link_contrato: string
          m2a_ata_id: string | null
          m2a_ata_numero: string | null
          m2a_contrato_id: string | null
          m2a_documentos_gerados: Json
          numero_contrato: string
          objeto: string
          preposto: string
          processo_id: string | null
          publicado: boolean
          publicado_at: string | null
          publicado_por: string | null
          secretaria_id: string | null
          secretaria_nome: string
          secretaria_num: number
          secretaria_sigla: string
          status: string
          status_envio_m2a: string
          ultimo_erro_m2a: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: string | null
          data_criacao_legada?: string | null
          data_texto_legado?: string | null
          deleted_at?: string | null
          dotacao?: string | null
          enviado_m2a_em?: string | null
          fiscal: string
          fornecedor_nome?: string | null
          id?: string
          import_job_id?: string | null
          impresso_assinado?: boolean
          legacy_id?: number | null
          link_contrato: string
          m2a_ata_id?: string | null
          m2a_ata_numero?: string | null
          m2a_contrato_id?: string | null
          m2a_documentos_gerados?: Json
          numero_contrato: string
          objeto: string
          preposto: string
          processo_id?: string | null
          publicado?: boolean
          publicado_at?: string | null
          publicado_por?: string | null
          secretaria_id?: string | null
          secretaria_nome: string
          secretaria_num: number
          secretaria_sigla: string
          status?: string
          status_envio_m2a?: string
          ultimo_erro_m2a?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: string | null
          data_criacao_legada?: string | null
          data_texto_legado?: string | null
          deleted_at?: string | null
          dotacao?: string | null
          enviado_m2a_em?: string | null
          fiscal?: string
          fornecedor_nome?: string | null
          id?: string
          import_job_id?: string | null
          impresso_assinado?: boolean
          legacy_id?: number | null
          link_contrato?: string
          m2a_ata_id?: string | null
          m2a_ata_numero?: string | null
          m2a_contrato_id?: string | null
          m2a_documentos_gerados?: Json
          numero_contrato?: string
          objeto?: string
          preposto?: string
          processo_id?: string | null
          publicado?: boolean
          publicado_at?: string | null
          publicado_por?: string | null
          secretaria_id?: string | null
          secretaria_nome?: string
          secretaria_num?: number
          secretaria_sigla?: string
          status?: string
          status_envio_m2a?: string
          ultimo_erro_m2a?: string | null
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
      fornecedores_prepostos: {
        Row: {
          ativo: boolean
          created_at: string
          fornecedor_cnpj: string | null
          fornecedor_nome: string
          fornecedor_nome_norm: string
          id: string
          preposto_nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          fornecedor_cnpj?: string | null
          fornecedor_nome: string
          fornecedor_nome_norm: string
          id?: string
          preposto_nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          fornecedor_cnpj?: string | null
          fornecedor_nome?: string
          fornecedor_nome_norm?: string
          id?: string
          preposto_nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      irp_job_secretarias: {
        Row: {
          cabecalho_coluna: string
          created_at: string
          dotacao_orgao: string | null
          dotacao_projeto_atividade: string | null
          dotacao_uo: string | null
          erro: string | null
          fiscal_servidor_id: string | null
          gestor_servidor_id: string | null
          id: string
          itens_validos: number
          job_id: string
          m2a_completed_at: string | null
          m2a_mensagem: string | null
          m2a_started_at: string | null
          m2a_status: string
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
          dotacao_orgao?: string | null
          dotacao_projeto_atividade?: string | null
          dotacao_uo?: string | null
          erro?: string | null
          fiscal_servidor_id?: string | null
          gestor_servidor_id?: string | null
          id?: string
          itens_validos?: number
          job_id: string
          m2a_completed_at?: string | null
          m2a_mensagem?: string | null
          m2a_started_at?: string | null
          m2a_status?: string
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
          dotacao_orgao?: string | null
          dotacao_projeto_atividade?: string | null
          dotacao_uo?: string | null
          erro?: string | null
          fiscal_servidor_id?: string | null
          gestor_servidor_id?: string | null
          id?: string
          itens_validos?: number
          job_id?: string
          m2a_completed_at?: string | null
          m2a_mensagem?: string | null
          m2a_started_at?: string | null
          m2a_status?: string
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
            foreignKeyName: "irp_job_secretarias_fiscal_servidor_id_fkey"
            columns: ["fiscal_servidor_id"]
            isOneToOne: false
            referencedRelation: "m2a_servidores"
            referencedColumns: ["id_local"]
          },
          {
            foreignKeyName: "irp_job_secretarias_gestor_servidor_id_fkey"
            columns: ["gestor_servidor_id"]
            isOneToOne: false
            referencedRelation: "m2a_servidores"
            referencedColumns: ["id_local"]
          },
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
          agente_planejamento_m2a_pk: string | null
          ano_orcamento: number | null
          classificacao: string | null
          comissao_planejamento: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          data_processo: string | null
          error_message: string | null
          id: string
          idx_descricao: number | null
          idx_especificacao: number | null
          idx_natureza: number | null
          idx_unidade: number | null
          linha_cabecalho: number | null
          m2a_envio_completed_at: string | null
          m2a_envio_etapa: string | null
          m2a_envio_mensagem: string | null
          m2a_envio_started_at: string | null
          m2a_envio_status: string
          m2a_processo_id: string | null
          m2a_processo_numero: string | null
          objeto: string | null
          orgao_solicitante_id: string | null
          original_filename: string
          processo_id: string | null
          responsavel_dfd_id: string | null
          secretarias_com_itens: number
          secretarias_sem_itens: number
          started_at: string | null
          status: string
          total_linhas: number
          total_secretarias: number
          total_valor: number
          unidade_orcamentaria_id: string | null
          unidade_orcamentaria_m2a_pk: string | null
          updated_at: string
          upload_file_id: string | null
        }
        Insert: {
          agente_planejamento_m2a_pk?: string | null
          ano_orcamento?: number | null
          classificacao?: string | null
          comissao_planejamento?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          data_processo?: string | null
          error_message?: string | null
          id?: string
          idx_descricao?: number | null
          idx_especificacao?: number | null
          idx_natureza?: number | null
          idx_unidade?: number | null
          linha_cabecalho?: number | null
          m2a_envio_completed_at?: string | null
          m2a_envio_etapa?: string | null
          m2a_envio_mensagem?: string | null
          m2a_envio_started_at?: string | null
          m2a_envio_status?: string
          m2a_processo_id?: string | null
          m2a_processo_numero?: string | null
          objeto?: string | null
          orgao_solicitante_id?: string | null
          original_filename: string
          processo_id?: string | null
          responsavel_dfd_id?: string | null
          secretarias_com_itens?: number
          secretarias_sem_itens?: number
          started_at?: string | null
          status?: string
          total_linhas?: number
          total_secretarias?: number
          total_valor?: number
          unidade_orcamentaria_id?: string | null
          unidade_orcamentaria_m2a_pk?: string | null
          updated_at?: string
          upload_file_id?: string | null
        }
        Update: {
          agente_planejamento_m2a_pk?: string | null
          ano_orcamento?: number | null
          classificacao?: string | null
          comissao_planejamento?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          data_processo?: string | null
          error_message?: string | null
          id?: string
          idx_descricao?: number | null
          idx_especificacao?: number | null
          idx_natureza?: number | null
          idx_unidade?: number | null
          linha_cabecalho?: number | null
          m2a_envio_completed_at?: string | null
          m2a_envio_etapa?: string | null
          m2a_envio_mensagem?: string | null
          m2a_envio_started_at?: string | null
          m2a_envio_status?: string
          m2a_processo_id?: string | null
          m2a_processo_numero?: string | null
          objeto?: string | null
          orgao_solicitante_id?: string | null
          original_filename?: string
          processo_id?: string | null
          responsavel_dfd_id?: string | null
          secretarias_com_itens?: number
          secretarias_sem_itens?: number
          started_at?: string | null
          status?: string
          total_linhas?: number
          total_secretarias?: number
          total_valor?: number
          unidade_orcamentaria_id?: string | null
          unidade_orcamentaria_m2a_pk?: string | null
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
            foreignKeyName: "irp_jobs_orgao_solicitante_id_fkey"
            columns: ["orgao_solicitante_id"]
            isOneToOne: false
            referencedRelation: "m2a_unidades_gestoras"
            referencedColumns: ["id_local"]
          },
          {
            foreignKeyName: "irp_jobs_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "irp_jobs_responsavel_dfd_id_fkey"
            columns: ["responsavel_dfd_id"]
            isOneToOne: false
            referencedRelation: "m2a_servidores"
            referencedColumns: ["id_local"]
          },
          {
            foreignKeyName: "irp_jobs_unidade_orcamentaria_id_fkey"
            columns: ["unidade_orcamentaria_id"]
            isOneToOne: false
            referencedRelation: "m2a_unidades_gestoras"
            referencedColumns: ["id_local"]
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
      m2a_agentes_planejamento: {
        Row: {
          ativo: boolean
          created_at: string
          data_referencia: string | null
          id_local: string
          nome: string
          servidor_m2a_id: string
          unidade_m2a_id: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          data_referencia?: string | null
          id_local?: string
          nome: string
          servidor_m2a_id: string
          unidade_m2a_id: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          data_referencia?: string | null
          id_local?: string
          nome?: string
          servidor_m2a_id?: string
          unidade_m2a_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      m2a_atas: {
        Row: {
          created_at: string
          fornecedor_cnpj: string | null
          fornecedor_nome: string | null
          id: string
          m2a_ata_id: string
          numero_ata: string
          processo_id: string
          synced_at: string
        }
        Insert: {
          created_at?: string
          fornecedor_cnpj?: string | null
          fornecedor_nome?: string | null
          id?: string
          m2a_ata_id: string
          numero_ata: string
          processo_id: string
          synced_at?: string
        }
        Update: {
          created_at?: string
          fornecedor_cnpj?: string | null
          fornecedor_nome?: string | null
          id?: string
          m2a_ata_id?: string
          numero_ata?: string
          processo_id?: string
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "m2a_atas_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      m2a_contratos_snapshot: {
        Row: {
          ano: number | null
          created_at: string
          id: string
          m2a_ata_id: string | null
          m2a_contrato_id: string
          numero_contrato: string
          processo_id: string
          raw: Json | null
          secretaria_sigla: string | null
          sequencia: number | null
        }
        Insert: {
          ano?: number | null
          created_at?: string
          id?: string
          m2a_ata_id?: string | null
          m2a_contrato_id: string
          numero_contrato: string
          processo_id: string
          raw?: Json | null
          secretaria_sigla?: string | null
          sequencia?: number | null
        }
        Update: {
          ano?: number | null
          created_at?: string
          id?: string
          m2a_ata_id?: string | null
          m2a_contrato_id?: string
          numero_contrato?: string
          processo_id?: string
          raw?: Json | null
          secretaria_sigla?: string | null
          sequencia?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "m2a_contratos_snapshot_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      m2a_envio_logs: {
        Row: {
          contrato_id: string
          created_at: string
          created_by: string | null
          duracao_ms: number | null
          etapa: string
          http_status: number | null
          id: string
          mensagem: string | null
          payload_json: Json | null
          response_json: Json | null
          sucesso: boolean
        }
        Insert: {
          contrato_id: string
          created_at?: string
          created_by?: string | null
          duracao_ms?: number | null
          etapa: string
          http_status?: number | null
          id?: string
          mensagem?: string | null
          payload_json?: Json | null
          response_json?: Json | null
          sucesso?: boolean
        }
        Update: {
          contrato_id?: string
          created_at?: string
          created_by?: string | null
          duracao_ms?: number | null
          etapa?: string
          http_status?: number | null
          id?: string
          mensagem?: string | null
          payload_json?: Json | null
          response_json?: Json | null
          sucesso?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "m2a_envio_logs_contrato_id_fkey"
            columns: ["contrato_id"]
            isOneToOne: false
            referencedRelation: "contratos"
            referencedColumns: ["id"]
          },
        ]
      }
      m2a_envio_preferencias: {
        Row: {
          created_at: string
          data_padrao: string | null
          fiscal_id: string
          gestor_id: string
          id: string
          secretaria_id: string | null
          unidade_gestora_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_padrao?: string | null
          fiscal_id: string
          gestor_id: string
          id?: string
          secretaria_id?: string | null
          unidade_gestora_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_padrao?: string | null
          fiscal_id?: string
          gestor_id?: string
          id?: string
          secretaria_id?: string | null
          unidade_gestora_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "m2a_envio_preferencias_secretaria_id_fkey"
            columns: ["secretaria_id"]
            isOneToOne: false
            referencedRelation: "secretarias"
            referencedColumns: ["id"]
          },
        ]
      }
      m2a_itens: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          m2a_ata_id: string
          m2a_item_id: string
          numero_item: string | null
          processo_id: string
          unidade: string | null
          valor_unitario: number
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          m2a_ata_id: string
          m2a_item_id: string
          numero_item?: string | null
          processo_id: string
          unidade?: string | null
          valor_unitario?: number
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          m2a_ata_id?: string
          m2a_item_id?: string
          numero_item?: string | null
          processo_id?: string
          unidade?: string | null
          valor_unitario?: number
        }
        Relationships: [
          {
            foreignKeyName: "m2a_itens_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "processos"
            referencedColumns: ["id"]
          },
        ]
      }
      m2a_servidor_unidade: {
        Row: {
          created_at: string
          servidor_id: string
          unidade_id: string
        }
        Insert: {
          created_at?: string
          servidor_id: string
          unidade_id: string
        }
        Update: {
          created_at?: string
          servidor_id?: string
          unidade_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "m2a_servidor_unidade_servidor_id_fkey"
            columns: ["servidor_id"]
            isOneToOne: false
            referencedRelation: "m2a_servidores"
            referencedColumns: ["id_local"]
          },
          {
            foreignKeyName: "m2a_servidor_unidade_unidade_id_fkey"
            columns: ["unidade_id"]
            isOneToOne: false
            referencedRelation: "m2a_unidades_gestoras"
            referencedColumns: ["id_local"]
          },
        ]
      }
      m2a_servidores: {
        Row: {
          ativo: boolean
          cargo: Database["public"]["Enums"]["m2a_servidor_cargo"]
          cpf: string | null
          created_at: string
          id_local: string
          m2a_id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          cargo: Database["public"]["Enums"]["m2a_servidor_cargo"]
          cpf?: string | null
          created_at?: string
          id_local?: string
          m2a_id: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          cargo?: Database["public"]["Enums"]["m2a_servidor_cargo"]
          cpf?: string | null
          created_at?: string
          id_local?: string
          m2a_id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      m2a_unidades_gestoras: {
        Row: {
          ativa: boolean
          created_at: string
          id_local: string
          m2a_id: string
          nome: string
          sigla: string | null
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          id_local?: string
          m2a_id: string
          nome: string
          sigla?: string | null
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          id_local?: string
          m2a_id?: string
          nome?: string
          sigla?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      m2a_unidades_orcamentarias: {
        Row: {
          ativa: boolean
          created_at: string
          id_local: string
          m2a_id: string
          nome: string
          orgao_m2a_id: string
          updated_at: string
        }
        Insert: {
          ativa?: boolean
          created_at?: string
          id_local?: string
          m2a_id: string
          nome: string
          orgao_m2a_id: string
          updated_at?: string
        }
        Update: {
          ativa?: boolean
          created_at?: string
          id_local?: string
          m2a_id?: string
          nome?: string
          orgao_m2a_id?: string
          updated_at?: string
        }
        Relationships: []
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
          deleted_at: string | null
          id: string
          m2a_processo_id: string | null
          m2a_sync_at: string | null
          m2a_url: string | null
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
          deleted_at?: string | null
          id?: string
          m2a_processo_id?: string | null
          m2a_sync_at?: string | null
          m2a_url?: string | null
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
          deleted_at?: string | null
          id?: string
          m2a_processo_id?: string | null
          m2a_sync_at?: string | null
          m2a_url?: string | null
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
      secretaria_contatos: {
        Row: {
          cpf: string
          created_at: string
          id: string
          papel: string
          secretaria_id: string
          updated_at: string
        }
        Insert: {
          cpf: string
          created_at?: string
          id?: string
          papel: string
          secretaria_id: string
          updated_at?: string
        }
        Update: {
          cpf?: string
          created_at?: string
          id?: string
          papel?: string
          secretaria_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "secretaria_contatos_secretaria_id_fkey"
            columns: ["secretaria_id"]
            isOneToOne: false
            referencedRelation: "secretarias"
            referencedColumns: ["id"]
          },
        ]
      }
      secretarias: {
        Row: {
          ativa: boolean
          created_at: string
          id: string
          m2a_dot_id: string | null
          m2a_dot_orgao_id: string | null
          m2a_dotacao_default: string | null
          m2a_fiscal_codigo: string | null
          m2a_fiscal_nome: string | null
          m2a_gestor_codigo: string | null
          m2a_gestor_nome: string | null
          m2a_orgao_id: string | null
          m2a_ref_coluna: number | null
          m2a_uo_id: string | null
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
          m2a_dot_id?: string | null
          m2a_dot_orgao_id?: string | null
          m2a_dotacao_default?: string | null
          m2a_fiscal_codigo?: string | null
          m2a_fiscal_nome?: string | null
          m2a_gestor_codigo?: string | null
          m2a_gestor_nome?: string | null
          m2a_orgao_id?: string | null
          m2a_ref_coluna?: number | null
          m2a_uo_id?: string | null
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
          m2a_dot_id?: string | null
          m2a_dot_orgao_id?: string | null
          m2a_dotacao_default?: string | null
          m2a_fiscal_codigo?: string | null
          m2a_fiscal_nome?: string | null
          m2a_gestor_codigo?: string | null
          m2a_gestor_nome?: string | null
          m2a_orgao_id?: string | null
          m2a_ref_coluna?: number | null
          m2a_uo_id?: string | null
          nome?: string
          numero?: number
          origem_legada?: boolean
          sigla?: string
          updated_at?: string
        }
        Relationships: []
      }
      trusted_devices: {
        Row: {
          created_at: string
          device_label: string | null
          expires_at: string
          id: string
          last_ip: unknown
          last_used_at: string | null
          revoked_at: string | null
          token_hash: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_label?: string | null
          expires_at?: string
          id?: string
          last_ip?: unknown
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_label?: string | null
          expires_at?: string
          id?: string
          last_ip?: unknown
          last_used_at?: string | null
          revoked_at?: string | null
          token_hash?: string
          user_agent?: string | null
          user_id?: string
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
      cleanup_logs_e_jobs: {
        Args: {
          p_audit_logs_days?: number
          p_import_jobs_days?: number
          p_m2a_logs_days?: number
        }
        Returns: Json
      }
      consume_trusted_device: {
        Args: { p_token_hash: string }
        Returns: string
      }
      dedupe_m2a_itens: { Args: { p_processo_id: string }; Returns: number }
      get_contract_report_data: {
        Args: { p_contract_id: string }
        Returns: {
          contract_id: string
          created_at: string
          dotacao: string
          fiscal: string
          fornecedor_nome: string
          item_descricao: string
          item_especificacao: string
          item_id: string
          item_lote: string
          item_numero: string
          item_ordem: number
          item_quantidade: number
          item_unidade: string
          item_valor_total: number
          item_valor_unitario: number
          m2a_ata_numero: string
          numero_contrato: string
          objeto: string
          preposto: string
          processo_id: string
          secretaria_nome: string
          secretaria_sigla: string
        }[]
      }
      get_multiple_contracts_report_data: {
        Args: { p_contract_ids: string[] }
        Returns: {
          contract_id: string
          created_at: string
          dotacao: string
          fiscal: string
          fornecedor_nome: string
          item_descricao: string
          item_especificacao: string
          item_id: string
          item_lote: string
          item_numero: string
          item_ordem: number
          item_quantidade: number
          item_unidade: string
          item_valor_total: number
          item_valor_unitario: number
          m2a_ata_numero: string
          numero_contrato: string
          objeto: string
          preposto: string
          processo_id: string
          secretaria_nome: string
          secretaria_sigla: string
        }[]
      }
      get_pauta_consolidada_data: {
        Args: { p_processo_id: string }
        Returns: {
          contrato_id: string
          contrato_numero: string
          descricao: string
          empresa: string
          especificacao: string
          item_codigo: string
          item_id: string
          lote: string
          numero_item: string
          processo_id: string
          quantidade: number
          secretaria_sigla: string
          subcategoria: string
          unidade: string
          valor_total: number
          valor_unitario: number
        }[]
      }
      get_pauta_consolidada_full: {
        Args: { p_contrato_ids?: string[]; p_processo_id: string }
        Returns: {
          contrato_id: string
          contrato_numero: string
          descricao: string
          empresa: string
          especificacao: string
          item_codigo: string
          item_id: string
          lote: string
          no_contrato: boolean
          numero_item: string
          processo_id: string
          quantidade: number
          secretaria_sigla: string
          subcategoria: string
          unidade: string
          valor_total: number
          valor_unitario: number
        }[]
      }
      get_secretarias_cpfs: {
        Args: never
        Returns: {
          id: string
          m2a_fiscal_cpf: string
          m2a_gestor_cpf: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      next_contrato_number: { Args: { p_sec_num: number }; Returns: number }
      next_contrato_number_for_base: {
        Args: { p_numero_base: string; p_sec_num: number; p_sec_sigla: string }
        Returns: number
      }
      next_contrato_numbers_batch: {
        Args: { p_qtd: number; p_sec_num: number }
        Returns: number
      }
      next_contrato_numbers_batch_for_base: {
        Args: {
          p_numero_base: string
          p_qtd: number
          p_sec_num: number
          p_sec_sigla: string
        }
        Returns: number
      }
      normalize_m2a_text: { Args: { s: string }; Returns: string }
      normalize_numero_item: { Args: { s: string }; Returns: string }
      restore_soft_deleted_process: {
        Args: { p_processo_id: string }
        Returns: undefined
      }
      sync_m2a_atas_fornecedor_from_snapshot: {
        Args: { p_processo_id?: string }
        Returns: number
      }
      sync_m2a_contract_dates_from_snapshot: {
        Args: { p_processo_id: string }
        Returns: number
      }
      sync_m2a_snapshot: {
        Args: { p_payload: Json; p_processo_id: string }
        Returns: Json
      }
      upsert_secretaria_contato: {
        Args: { p_cpf: string; p_papel: string; p_secretaria_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "gestor" | "operador" | "consulta"
      m2a_servidor_cargo: "FISCAL" | "GESTOR" | "PREPOSTO"
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
      m2a_servidor_cargo: ["FISCAL", "GESTOR", "PREPOSTO"],
    },
  },
} as const
