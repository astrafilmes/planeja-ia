import { m2a } from "../m2a-client.js";

/**
 * GET /numeracao?ano=2025&secretarias=SECAD,SECEDU
 * Retorna o maior número de contrato (NNN/AAAA<SIGLA>) por secretaria/ano.
 */
export async function numeracaoRoutes(app) {
  app.get("/numeracao", async (req, reply) => {
    const ano = Number(req.query.ano);
    const sigs = String(req.query.secretarias ?? "")
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    if (!Number.isFinite(ano) || !sigs.length) {
      return reply.code(400).send({ error: "ano e secretarias são obrigatórios" });
    }

    const itens = [];
    for (const sigla of sigs) {
      try {
        const url = `/contratacao/contratos/?secretaria=${encodeURIComponent(sigla)}&ano=${ano}`;
        const r = await m2a.get(url);
        const re = new RegExp(`(\\d{1,4})\\s*/\\s*${ano}\\s*${sigla}`, "gi");
        let max = 0;
        let found = false;
        let m;
        while ((m = re.exec(r.html)) !== null) {
          const n = parseInt(m[1], 10);
          if (!Number.isNaN(n) && n > max) {
            found = true;
            max = n;
          }
        }
        itens.push({ sigla, ano, ultimo_numero: found ? max : null });
      } catch (err) {
        itens.push({ sigla, ano, ultimo_numero: null, erro: String(err?.message ?? err) });
      }
    }
    return { ano, itens };
  });
}
