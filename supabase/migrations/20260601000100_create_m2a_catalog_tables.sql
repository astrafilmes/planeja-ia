DO $$ BEGIN
  CREATE TYPE public.m2a_servidor_cargo AS ENUM ('FISCAL', 'GESTOR', 'PREPOSTO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.m2a_unidades_gestoras (
  id_local uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  m2a_id varchar NOT NULL UNIQUE,
  nome text NOT NULL UNIQUE,
  sigla text,
  ativa boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.m2a_servidores (
  id_local uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  m2a_id varchar NOT NULL UNIQUE,
  nome text NOT NULL,
  cpf text,
  cargo public.m2a_servidor_cargo NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.m2a_servidor_unidade (
  servidor_id uuid NOT NULL REFERENCES public.m2a_servidores(id_local) ON DELETE CASCADE,
  unidade_id uuid NOT NULL REFERENCES public.m2a_unidades_gestoras(id_local) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (servidor_id, unidade_id)
);

ALTER TABLE public.secretarias
  ADD COLUMN IF NOT EXISTS m2a_fiscal_codigo text,
  ADD COLUMN IF NOT EXISTS m2a_gestor_codigo text;

CREATE INDEX IF NOT EXISTS m2a_unidades_gestoras_m2a_id_idx ON public.m2a_unidades_gestoras(m2a_id);
CREATE INDEX IF NOT EXISTS m2a_servidores_m2a_id_idx ON public.m2a_servidores(m2a_id);
CREATE INDEX IF NOT EXISTS m2a_servidores_cargo_idx ON public.m2a_servidores(cargo);
CREATE INDEX IF NOT EXISTS m2a_servidor_unidade_unidade_idx ON public.m2a_servidor_unidade(unidade_id);

ALTER TABLE public.m2a_unidades_gestoras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m2a_servidores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.m2a_servidor_unidade ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.m2a_unidades_gestoras TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.m2a_servidores TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.m2a_servidor_unidade TO authenticated;
GRANT ALL ON public.m2a_unidades_gestoras TO service_role;
GRANT ALL ON public.m2a_servidores TO service_role;
GRANT ALL ON public.m2a_servidor_unidade TO service_role;

DROP POLICY IF EXISTS m2a_unidades_select ON public.m2a_unidades_gestoras;
DROP POLICY IF EXISTS m2a_unidades_modify ON public.m2a_unidades_gestoras;
DROP POLICY IF EXISTS m2a_servidores_select ON public.m2a_servidores;
DROP POLICY IF EXISTS m2a_servidores_modify ON public.m2a_servidores;
DROP POLICY IF EXISTS m2a_servidor_unidade_select ON public.m2a_servidor_unidade;
DROP POLICY IF EXISTS m2a_servidor_unidade_modify ON public.m2a_servidor_unidade;

CREATE POLICY m2a_unidades_select ON public.m2a_unidades_gestoras
  FOR SELECT TO authenticated USING (true);
CREATE POLICY m2a_unidades_modify ON public.m2a_unidades_gestoras
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role));

CREATE POLICY m2a_servidores_select ON public.m2a_servidores
  FOR SELECT TO authenticated USING (true);
CREATE POLICY m2a_servidores_modify ON public.m2a_servidores
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role));

CREATE POLICY m2a_servidor_unidade_select ON public.m2a_servidor_unidade
  FOR SELECT TO authenticated USING (true);
CREATE POLICY m2a_servidor_unidade_modify ON public.m2a_servidor_unidade
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'gestor'::public.app_role));

INSERT INTO public.m2a_unidades_gestoras (m2a_id, nome, sigla) VALUES
  ('7757', 'CONTROLADORIA GERAL DO MUNICÍPIO', 'CGM'),
  ('7767', 'GABINETE DO PREFEITO', 'GAB'),
  ('7768', 'SECRETARIA DE ADMINISTRAÇÃO, FINANÇAS E PLANEJAMENTO', 'SAF'),
  ('7769', 'SECRETARIA DE INFRAESTRUTURA, MOBILIDADE E SERV. PÚBLICOS', 'INFRA'),
  ('7770', 'SECRETARIA DE DESENVOLVIMENTO RURAL E PESCA', 'SDR'),
  ('7771', 'SECRETARIA DE ESPORTE, JUVENTUDE E LAZER', 'SEJUV'),
  ('7772', 'SECRETARIA MUNICIPAL DE EDUCAÇÃO', 'SME'),
  ('7773', 'SECRETARIA MUNICIPAL DE SAÚDE', 'SMS'),
  ('7774', 'SECRETARIA MUNICIPAL DE PROTEÇÃO SOCIAL E CIDADANIA', 'SPS'),
  ('7775', 'SECRETARIA DE MEIO AMBIENTE', 'SEMA'),
  ('7776', 'SECRETARIA DE CULTURA E TURISMO', 'SECULT'),
  ('9680', 'FUNDO DE PREVIDÊNCIA SOCIAL DO MUNICÍPIO DE ITAREMA', 'PREVI')
ON CONFLICT (m2a_id) DO UPDATE SET
  nome = EXCLUDED.nome,
  sigla = EXCLUDED.sigla,
  ativa = true,
  updated_at = now();

INSERT INTO public.m2a_servidores (m2a_id, nome, cpf, cargo) VALUES
  ('38061', 'ANA LAYADNA SILVA VASCONCELOS', NULL, 'FISCAL'),
  ('49276', 'ANA QUEZIA SANTOS BARROSO', NULL, 'FISCAL'),
  ('47524', 'CRISTIANO JOSE DOS SANTOS', NULL, 'FISCAL'),
  ('38034', 'ELIANE CARNEIRO DO NASCIMENTO', NULL, 'FISCAL'),
  ('49030', 'FRANCISCO PAULO HENRIQUE COSTA FREITAS', NULL, 'FISCAL'),
  ('49309', 'FRANCISCO PAULO HENRIQUE COSTA FREITAS', NULL, 'FISCAL'),
  ('49434', 'GABRIEL MARTINS NEVES', NULL, 'FISCAL'),
  ('38062', 'JOÃO BATISTA OLIVEIRA FREITAS', NULL, 'FISCAL'),
  ('49071', 'JOÃO PAULO DE SIQUEIRA PRADO', NULL, 'FISCAL'),
  ('49534', 'JOSÉ ADAURONNIE RODRIGUES MARQUES', NULL, 'FISCAL'),
  ('50162', 'JOSÉ ADAURONNIE RODRIGUES MARQUES', NULL, 'FISCAL'),
  ('38077', 'JOSÉ LEANDRO MONTEIRO RIBEIRO', NULL, 'FISCAL'),
  ('38050', 'JOSÉ ROBERTO ALVES DOS SANTOS', NULL, 'FISCAL'),
  ('49031', 'KAROLINE XAVIER GOMES', NULL, 'FISCAL'),
  ('38072', 'LARA FÉLIX HENRIQUE DE OLIVEIRA', NULL, 'FISCAL'),
  ('40497', 'LARA FÉLIX HENRIQUE DE OLIVEIRA', NULL, 'FISCAL'),
  ('41008', 'LARA FÉLIX HENRIQUE DE OLIVEIRA', NULL, 'FISCAL'),
  ('41010', 'LARA FÉLIX HENRIQUE DE OLIVEIRA', NULL, 'FISCAL'),
  ('41011', 'LARA FÉLIX HENRIQUE DE OLIVEIRA', NULL, 'FISCAL'),
  ('49028', 'MARCELO REGIS DA SILVA SANTOS', NULL, 'FISCAL'),
  ('38049', 'MARIA EVILANIA MARQUES SANTANA', NULL, 'FISCAL'),
  ('38091', 'MARIA NAIARA DOS SANTOS PIRES', NULL, 'FISCAL'),
  ('38051', 'MARIA TICIANA SANTOS ANDRADE', NULL, 'FISCAL'),
  ('38039', 'RENATO DA GUIA OLIVEIRA', NULL, 'FISCAL'),
  ('49339', 'SILVIO LUIS TORRES BORGES FILHO', NULL, 'FISCAL'),
  ('38040', 'CARLOS ANTONIO DOS SANTOS', NULL, 'GESTOR'),
  ('38029', 'EDERSON SILVEIRA SALES', NULL, 'GESTOR'),
  ('38023', 'FRANCISCO ANTONIO DOS SANTOS NETO', NULL, 'GESTOR'),
  ('38021', 'FRANCISCO FONTENELE FILHO', NULL, 'GESTOR'),
  ('49278', 'JOSE EDUARDO DA CUNHA PINHEIRO', NULL, 'GESTOR'),
  ('49284', 'FRANCISCO NOELIO FERNANDES ALBUQUERQUE', NULL, 'GESTOR'),
  ('43941', 'JOSE EDUARDO DA CUNHA PINHEIRO', NULL, 'GESTOR'),
  ('38053', 'JOSÉ INÁCIO SILVA PARENTE', NULL, 'GESTOR'),
  ('38019', 'LETICIA REICHEL DOS SANTOS', NULL, 'GESTOR'),
  ('38097', 'LETICIA REICHEL DOS SANTOS', NULL, 'GESTOR'),
  ('38058', 'MARCOS KILDARY RIBEIRO ALVES', NULL, 'GESTOR'),
  ('38056', 'MARIA LUCÉLIA PINTO MONTEIRO', NULL, 'GESTOR'),
  ('38074', 'RAIMUNDO CARNEIRO DA GUIA', NULL, 'GESTOR'),
  ('47495', 'RAIMUNDO CARNEIRO DA GUIA', NULL, 'GESTOR'),
  ('38026', 'ROSA VIRGINIA MONTEIRO', NULL, 'GESTOR'),
  ('43301', 'ROSA VIRGINIA MONTEIRO', NULL, 'GESTOR')
ON CONFLICT (m2a_id) DO UPDATE SET
  nome = EXCLUDED.nome,
  cpf = EXCLUDED.cpf,
  cargo = EXCLUDED.cargo,
  ativo = true,
  updated_at = now();

WITH rel(servidor_m2a_id, unidade_m2a_id) AS (
  VALUES
  ('38061','7770'),
  ('49276','7757'), ('49276','7767'), ('49276','7768'), ('49276','9680'),
  ('47524','7772'),
  ('38034','7757'), ('38034','7767'), ('38034','9680'),
  ('49030','7773'), ('49309','7773'),
  ('49434','7757'), ('49434','7767'), ('49434','7768'), ('49434','7769'), ('49434','7770'), ('49434','7771'), ('49434','7772'), ('49434','7773'), ('49434','7774'), ('49434','7775'), ('49434','7776'),
  ('38062','7769'), ('49071','7769'),
  ('49534','7772'), ('50162','7772'),
  ('38077','7771'),
  ('38050','7774'),
  ('49031','7775'), ('49031','7776'),
  ('38072','7768'), ('40497','7768'), ('41008','7768'), ('41010','7768'), ('41011','7768'),
  ('49028','7773'), ('38049','7773'),
  ('38091','7772'), ('38051','7772'),
  ('38039','7775'), ('38039','7776'),
  ('49339','7769'),
  ('38040','7770'),
  ('38029','7771'),
  ('38023','7767'),
  ('38021','7768'), ('49278','7768'),
  ('49284','7757'), ('43941','7757'),
  ('38053','7769'),
  ('38019','7773'), ('38097','7773'),
  ('38058','7772'),
  ('38056','7774'),
  ('38074','9680'), ('47495','9680'),
  ('38026','7775'), ('38026','7776'), ('43301','7775'), ('43301','7776')
)
INSERT INTO public.m2a_servidor_unidade (servidor_id, unidade_id)
SELECT s.id_local, u.id_local
FROM rel
JOIN public.m2a_servidores s ON s.m2a_id = rel.servidor_m2a_id
JOIN public.m2a_unidades_gestoras u ON u.m2a_id = rel.unidade_m2a_id
ON CONFLICT DO NOTHING;

UPDATE public.secretarias s
SET m2a_orgao_id = u.m2a_id
FROM public.m2a_unidades_gestoras u
WHERE upper(s.nome) = upper(u.nome)
  AND (s.m2a_orgao_id IS NULL OR s.m2a_orgao_id = '');
