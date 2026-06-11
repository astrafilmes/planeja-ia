
-- 1) Tabela nova
CREATE TABLE IF NOT EXISTS public.secretaria_contatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secretaria_id uuid NOT NULL REFERENCES public.secretarias(id) ON DELETE CASCADE,
  papel text NOT NULL CHECK (papel IN ('gestor','fiscal')),
  cpf text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (secretaria_id, papel)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.secretaria_contatos TO authenticated;
GRANT ALL ON public.secretaria_contatos TO service_role;

ALTER TABLE public.secretaria_contatos ENABLE ROW LEVEL SECURITY;

-- RLS: ninguém acessa direto (nem authenticated). Tudo via RPC.
CREATE POLICY "deny direct access" ON public.secretaria_contatos
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP TRIGGER IF EXISTS trg_touch_updated_at ON public.secretaria_contatos;
CREATE TRIGGER trg_touch_updated_at BEFORE UPDATE ON public.secretaria_contatos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS secretaria_contatos_secretaria_id_idx
  ON public.secretaria_contatos(secretaria_id);

-- 2) Backfill a partir de secretarias
INSERT INTO public.secretaria_contatos (secretaria_id, papel, cpf)
SELECT id, 'gestor', NULLIF(btrim(m2a_gestor_cpf), '')
  FROM public.secretarias
 WHERE NULLIF(btrim(m2a_gestor_cpf), '') IS NOT NULL
ON CONFLICT (secretaria_id, papel) DO NOTHING;

INSERT INTO public.secretaria_contatos (secretaria_id, papel, cpf)
SELECT id, 'fiscal', NULLIF(btrim(m2a_fiscal_cpf), '')
  FROM public.secretarias
 WHERE NULLIF(btrim(m2a_fiscal_cpf), '') IS NOT NULL
ON CONFLICT (secretaria_id, papel) DO NOTHING;

-- 3) Atualizar get_secretarias_cpfs para ler da nova tabela
CREATE OR REPLACE FUNCTION public.get_secretarias_cpfs()
 RETURNS TABLE(id uuid, m2a_gestor_cpf text, m2a_fiscal_cpf text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores e gestores podem consultar CPFs.';
  END IF;

  RETURN QUERY
    SELECT s.id,
           max(CASE WHEN sc.papel = 'gestor' THEN sc.cpf END) AS m2a_gestor_cpf,
           max(CASE WHEN sc.papel = 'fiscal' THEN sc.cpf END) AS m2a_fiscal_cpf
      FROM public.secretarias s
      LEFT JOIN public.secretaria_contatos sc ON sc.secretaria_id = s.id
     GROUP BY s.id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_secretarias_cpfs() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_secretarias_cpfs() TO authenticated, service_role;

-- 4) RPC de escrita — único caminho permitido pra setar CPF
CREATE OR REPLACE FUNCTION public.upsert_secretaria_contato(
  p_secretaria_id uuid,
  p_papel text,
  p_cpf text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cpf text := NULLIF(btrim(p_cpf), '');
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores e gestores podem alterar CPFs.';
  END IF;

  IF p_papel NOT IN ('gestor','fiscal') THEN
    RAISE EXCEPTION 'papel inválido: %', p_papel;
  END IF;

  IF v_cpf IS NULL THEN
    DELETE FROM public.secretaria_contatos
     WHERE secretaria_id = p_secretaria_id AND papel = p_papel;
  ELSE
    INSERT INTO public.secretaria_contatos (secretaria_id, papel, cpf)
    VALUES (p_secretaria_id, p_papel, v_cpf)
    ON CONFLICT (secretaria_id, papel)
    DO UPDATE SET cpf = EXCLUDED.cpf, updated_at = now();
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_secretaria_contato(uuid, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_secretaria_contato(uuid, text, text) TO authenticated, service_role;

-- 5) Remover colunas de CPF da tabela secretarias
ALTER TABLE public.secretarias DROP COLUMN IF EXISTS m2a_gestor_cpf;
ALTER TABLE public.secretarias DROP COLUMN IF EXISTS m2a_fiscal_cpf;
