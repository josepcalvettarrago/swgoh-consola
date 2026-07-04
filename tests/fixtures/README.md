# Fixtures

Aquí se guardará el **JSON real** capturado de swgoh.gg en el gate de la Fase 1
(`player.json`, `characters.json`), para escribir y testear el normalizador contra la forma
real de la API — no contra nombres de campo inventados.

Captura (una vez, en el gate):

```bash
# vía Worker en local:
wrangler dev            # en worker/
curl "http://localhost:8787/debug/raw?ally=355463284" > tests/fixtures/player.json

# o directo (si el endpoint público responde sin key):
curl -H "accept: application/json" "https://swgoh.gg/api/player/355463284/" > tests/fixtures/player.json
```
