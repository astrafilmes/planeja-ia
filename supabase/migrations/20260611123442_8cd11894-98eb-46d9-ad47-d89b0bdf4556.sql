-- 1) Lock down CPF columns on secretarias via column-level privileges.
--    Authenticated users keep access to all columns EXCEPT the two CPFs.
--    Admin/gestor continue reading CPFs through public.get_secretarias_cpfs().
REVOKE SELECT ON public.secretarias FROM authenticated;
GRANT SELECT (
  id, numero, nome, sigla, ativa, origem_legada, created_at, updated_at,
  m2a_orgao_id, m2a_uo_id, m2a_dot_id, m2a_dotacao_default, m2a_ref_coluna,
  m2a_fiscal_nome, m2a_gestor_nome,
  m2a_dot_orgao_id, m2a_fiscal_codigo, m2a_gestor_codigo
) ON public.secretarias TO authenticated;

-- Service role keeps full access (edge functions / admin paths).
GRANT ALL ON public.secretarias TO service_role;

-- 2) Tighten SELECT on public.secretarias so 'consulta' role is excluded
--    (atual policy permitia admin/gestor/operador; consulta nunca lia, mas
--    formalizamos e mantemos operador para o app funcionar).
DROP POLICY IF EXISTS sec_select_auth ON public.secretarias;
CREATE POLICY sec_select_auth
  ON public.secretarias
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR public.has_role(auth.uid(), 'operador'::public.app_role)
  );

-- 3) Alinha CRUD em contrato_item_dotacoes: hoje SELECT é livre para qualquer
--    usuário logado (inclui 'consulta'), enquanto UPDATE/DELETE exigem
--    admin/gestor e INSERT inclui operador. Padronizamos para admin/gestor/operador
--    em TODAS as operações.
DROP POLICY IF EXISTS cid2_select ON public.contrato_item_dotacoes;
DROP POLICY IF EXISTS cid2_update ON public.contrato_item_dotacoes;
DROP POLICY IF EXISTS cid2_delete ON public.contrato_item_dotacoes;

CREATE POLICY cid2_select
  ON public.contrato_item_dotacoes
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR public.has_role(auth.uid(), 'operador'::public.app_role)
  );

CREATE POLICY cid2_update
  ON public.contrato_item_dotacoes
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR public.has_role(auth.uid(), 'operador'::public.app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR public.has_role(auth.uid(), 'operador'::public.app_role)
  );

CREATE POLICY cid2_delete
  ON public.contrato_item_dotacoes
  FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'gestor'::public.app_role)
    OR public.has_role(auth.uid(), 'operador'::public.app_role)
  );