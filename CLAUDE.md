# AI DJ — Contexto para agentes

DJ profesional autónomo impulsado por IA: decide qué suena, cuándo mezclar, qué transición usar y cómo evoluciona la energía del set durante horas. Monorepo npm workspaces, todo TypeScript estricto.

**Lee primero:** `docs/HANDOFF.md` (estado detallado + por dónde continuar, con prompts sugeridos por tarea) y `docs/BRAINSTORM_X10.md` (el plan ×10 completo). Este archivo es el mapa rápido.

## Arquitectura

```
shared/   Dominio musical puro (sin I/O), isomorfo cliente/servidor:
          types.ts, constants/ (Camelot, 28 géneros, 9 estados de energía,
          8 personalidades, 10 modos, 13 transiciones),
          dj/scoring.ts (selección + planTransition cuantizado a frases),
          dj/critique.ts (auto-crítica de mezcla: accept/adjust/reject),
          audio/tempo.ts (beatgrid: BPM fraccional + fase + downbeat),
          audio/loudness.ts (LUFS EBU R128 + trim), audio/beatgrid.ts.
          Tests en shared/tests/ → npm test -w @ai-dj/shared (15 verdes).
server/   Express. Rutas: /api/library, /api/sessions, /api/ai/plan-next.
          services/ai/ = planners conectables (DJPlanner): heurístico siempre;
          ClaudePlanner si ANTHROPIC_API_KEY (claude-opus-4-8, JSON estructurado,
          fallback automático). Persistencia: JSON (JsonStore) tras una interfaz
          pensada para migrar a InsForge/Postgres sin tocar servicios.
client/   React 18 + Tailwind 3 + Framer Motion + Zustand + Web Audio.
  audio/  AudioEngine (2 decks, EQ 3 bandas, filtros, delay, reverb, crossfader
          equal-power, limitador; transiciones = automatización sample-accurate),
          Deck (trim LUFS, tempo-sync ±8% con vuelta al tempo natural),
          synth.ts (biblioteca demo procedural ~170 pistas, determinista),
          analysis.ts (análisis de subidas sobre el DSP de shared).
  dj/     DJBrain (bucle: decide → critica → precarga → dispara cuantizado),
          EnergyNarrative (arco del modo), SetMemory (anti-repetición).
```

## Comandos

```bash
npm install
npm run build              # shared → server → client (server tiene prebuild)
npm test -w @ai-dj/shared  # tests DSP + crítico
npm run dev:server         # API :4000
npm run dev:client         # UI :5173 (proxy /api)
npm start                  # producción: un proceso sirve API + client/dist
```

## Reglas del proyecto

- Español en UI, docs y commits; código e identificadores en inglés.
- La lógica musical (scoring, transiciones, crítica, DSP) vive en `shared/` — nunca duplicarla en cliente o servidor, y mantenerla dependency-free (corre en navegador y Node).
- El cliente funciona 100% sin backend (offline-first): `client/src/lib/api.ts` es tolerante a fallos; no romper esa garantía.
- Extender: género → entrada en `shared/src/constants/genres.ts` · transición → `constants/transitions.ts` + automatización en `client/src/audio/AudioEngine.ts` · motor IA → implementar `DJPlanner` en `server/src/services/ai/` y registrarlo en su `index.ts`.
- Antes de dar algo por hecho: `npm run typecheck && npm run build && npm test -w @ai-dj/shared`.

## Estado y pendientes (resumen; detalle en docs/HANDOFF.md §4)

Hecho y verificado: app completa con mezcla cuantizada a frases, beatgrid real, LUFS, tempo-sync y bucle de auto-crítica; 15 tests verdes; despliegue configurado (`vercel.json` cliente estático — Root Directory debe ser la raíz; `render.yaml` full-stack).

Pendiente, por orden de impacto (cada bloque tiene prompt sugerido en el HANDOFF):
- **A. Tendencias por país** (Deezer charts sin auth) → TrendsService + `/api/trends/:region` + boost en scoring. ⭐ Empezar aquí (requiere red abierta).
- **B. Agente con tools**: convertir ClaudePlanner en loop de agente (tools: `critique_mix` ya existe, `get_trends`, `get_library`).
- **C. Tool de adquisición** (yt-dlp/spotDL; ojo ToS — preferir previews legales/CC0).
- **D. Generación controlada** (specs {bpm,key,estructura} → ACE-Step/InsForge; generar bridges/capas, no temas enteros).
- **E. Migrar persistencia a InsForge** (JsonStore → Postgres + storage de audio). El MCP de InsForge está configurado en el entorno remoto; en local, instalarlo con `npx @insforge/install`.
- **F. UX**: consola en vivo del agente, waveforms navegables con beatgrid, feedback 👍/👎.
