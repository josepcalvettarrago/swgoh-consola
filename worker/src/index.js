/**
 * Cloudflare Worker — SWGOH Consola (scaffolding Fase 1).
 *
 * En Fase 0 NO se despliega ni se usa. Queda preparado para la Fase 1:
 *   - fetch: endpoints /api/roster/:ally, /api/guild/:id, /api/meta/characters
 *   - scheduled (cron): llama a api.swgoh.gg (header x-gg-bot-access con env.SWGOH_GG_API_KEY),
 *     normaliza al esquema RD y escribe snapshots en Firestore.
 *
 * Respetar rate limit ~1 req/seg (encolar llamadas del gremio, no en paralelo).
 */
export default {
  async fetch(request, env) {
    return new Response(
      JSON.stringify({ ok: true, phase: 0, note: "Worker scaffolding — implementar en Fase 1" }),
      { headers: { "content-type": "application/json; charset=utf-8" } },
    );
  },

  // async scheduled(event, env, ctx) { /* Fase 1: pipeline swgoh.gg -> Firestore */ },
};
