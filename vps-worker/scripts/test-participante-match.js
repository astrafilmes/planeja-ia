import assert from "node:assert/strict";

process.env.M2A_BASE_URL ||= "http://example.test";
process.env.M2A_USERNAME ||= "test";
process.env.M2A_PASSWORD ||= "test";
process.env.SHARED_SECRET ||= "test";

const { resolverParticipante, scoreNomeParticipante } = await import(
  "../src/m2a/atas-participantes.js"
);

const participantes = [
  { participanteId: 6195, nome: "SECRETARIA MUNICIPAL DE SAÚDE", incluido: true },
  { participanteId: 1000, nome: "SECRETARIA MUNICIPAL DE EDUCAÇÃO", incluido: false },
];

const alvo = "SECRETARIA DE SAÚDE - HOSPITAL MUNICIPAL";
const scoreSaude = scoreNomeParticipante(alvo, "SECRETARIA MUNICIPAL DE SAÚDE");
const scoreEducacao = scoreNomeParticipante(alvo, "SECRETARIA MUNICIPAL DE EDUCAÇÃO");
const resolved = resolverParticipante(participantes, alvo);

assert.equal(resolved?.participanteId, 6195);
assert.ok(scoreSaude >= 0.8, `score saúde inesperado: ${scoreSaude}`);
assert.ok(scoreEducacao < 0.8, `score educação inesperado: ${scoreEducacao}`);

console.log("OK: participante equivalente com unidade interna resolvido com segurança");