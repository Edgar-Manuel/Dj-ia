# 🎧 AI DJ — Autonomous Mixing Intelligence

Aplicación web completa donde una IA actúa como **DJ profesional autónomo**: decide qué canción reproducir, cuándo mezclar, cuánto dura la transición, qué efectos usar y cómo evoluciona la energía del set durante horas, sin intervención del usuario.

![stack](https://img.shields.io/badge/stack-React%20%2B%20TypeScript%20%2B%20Web%20Audio%20%2B%20Express-22d3ee)

## ✨ Características

- **Modo automático IA**: selección continua por mezcla armónica (rueda Camelot), distancia de BPM, trayectoria de energía, popularidad, mood y memoria del set (sin repetir temas ni abusar de artistas).
- **Auto-crítica de mezcla** (bucle mide→critica→corrige): antes de cada mezcla, un crítico evalúa la decisión con datos objetivos — ventana de sync de BPM (rechaza saltos imposibles, admite medio/doble tiempo), choque de tonalidad Camelot (lo enmascara con FX o re-elige según el estilo del DJ), alineación de frase, salto de loudness residual tras el trim LUFS y salto de energía. Acepta, corrige o descarta y re-elige; la razón se muestra en la tarjeta «A continuación».
- **Motor de audio real** (Web Audio API): dos decks con EQ de 3 bandas, filtros, delay con feedback, reverb por convolución, crossfader equal-power y limitador master.
- **13 transiciones profesionales**: beatmatch, EQ mix, echo out, filter sweep, loop transition, reverb, delay throw, backspin, drop mix, smooth/long/quick blend y double drop — con automatización de parámetros sample-accurate.
- **Narrativa de energía**: 9 estados (Muy relajado → Pico máximo → Final épico) gobernados por el arco del modo de sesión.
- **10 modos de sesión** (Fiesta, Bar, Discoteca, Relax, Trabajo, Gym, Viaje, After, Sunset, Amanecer) y **8 personalidades de DJ** (Comercial, Underground, Festival, Techno, House, Radio, Lounge, Experimental) que cambian riesgo, duración de blends y transiciones favoritas.
- **28 géneros** — añadir uno nuevo = añadir una entrada en `shared/src/constants/genres.ts`.
- **Biblioteca demo sintetizada**: ~170 pistas generadas proceduralmente por el navegador (kick, bajo, pads, arps según género/tonalidad/BPM), estructuradas en secciones (intro/build/drop/break/outro) que la IA usa para elegir puntos de mezcla.
- **Subida de canciones** con análisis real en el navegador: **beatgrid completo** (BPM fraccional por peine armónico sin errores de octava, fase del beat y downbeat sobre la banda del kick), tonalidad Camelot (chroma + perfiles Krumhansl) y **loudness integrado EBU R128 (LUFS)**.
- **Mezcla cuantizada**: puntos de mezcla en frases de 4 compases, disparo exacto en el siguiente beat/downbeat del deck saliente, entrada del tema nuevo por un downbeat, sincronía de tempo (±8%) durante el blend con vuelta suave al tempo natural, y trim automático por deck hacia −14 LUFS. Tests del DSP en `shared/tests/` (`npm test -w @ai-dj/shared`).
- **Visualizador 60 FPS**: espectro, partículas y luces sincronizadas con el beat.
- **Sesiones**: guardar/cargar con historial completo.
- **Tendencias por región**: `TrendsService` consulta los charts públicos de Deezer (sin auth, 22 regiones + fallback global) con caché TTL de 30 min; el artista que está sonando ahora en tu región recibe un boost en el scoring.
- **Arquitectura IA modular**: cerebro heurístico local (offline-first, siempre disponible) + planificador **agente con tools** (Claude directo vía `ANTHROPIC_API_KEY`, u OpenRouter vía `OPENROUTER_API_KEY`), con fallback automático en cascada.

### 🤖 El planificador LLM es un agente, no una llamada única

Cuando hay una API key configurada, el planificador no se limita a devolver un JSON: **razona con herramientas** antes de decidir —

- `get_trends(region)` — consulta el chart real de la región antes de asumir qué está sonando.
- `get_library(genre?, minBpm?, maxBpm?)` — busca en toda la biblioteca, no solo en el shortlist inicial.
- `critique_mix(trackId, transitionType?, beats?)` — la misma auto-crítica objetiva del bucle local (tempo/armonía/frase/loudness/energía); el agente **debe** validar su elección aquí antes de responder, y si el veredicto es `reject`, prueba otra pista.
- `submit_plan(...)` — la acción final que cierra el turno.

Si el agente se queda sin turnos, responde sin herramientas, o falla por red, el sistema cae al siguiente planificador de la cadena (OpenRouter → Claude directo → heurístico local) sin intervención del usuario.

## 🏗️ Arquitectura

```
ai-dj/
├── shared/   # Tipos + dominio musical (Camelot, géneros, energía, scoring) — usado por cliente y servidor
├── server/   # Express + TypeScript: biblioteca, sesiones, tendencias, endpoint IA /api/ai/plan-next
│   ├── services/ai/      # DJPlanner: Heuristic + Claude + OpenRouter (agentes con tools compartidas)
│   └── services/trends/  # TrendsService + DeezerTrendsProvider (charts por región, caché TTL)
└── client/   # React + TypeScript + Tailwind + Framer Motion + Web Audio
    ├── audio/  # AudioEngine, Deck, sintetizador procedural, análisis BPM/key
    ├── dj/     # DJBrain, EnergyNarrative, SetMemory
    └── components/  # Decks, waveforms, crossfader, visualizador, selectores…
```

## 🚀 Puesta en marcha

```bash
npm install
npm run build          # compila shared + server + client

# Desarrollo (2 procesos):
npm run dev:server     # API en http://localhost:4000
npm run dev:client     # UI en http://localhost:5173 (proxy /api → 4000)

# Producción (un solo proceso, sirve el cliente compilado):
npm start
```

### Activar el planificador LLM (opcional)

Elige uno (si configuras ambos, se prueba OpenRouter primero):

```bash
# Opción A: OpenRouter (cualquier cuenta, sin API key directa de Anthropic)
export OPENROUTER_API_KEY=sk-or-...
# opcional: export AI_DJ_OPENROUTER_MODEL=anthropic/claude-opus-4.8

# Opción B: Anthropic directo
export ANTHROPIC_API_KEY=sk-ant-...
# opcional: export AI_DJ_CLAUDE_MODEL=claude-opus-4-8

npm run dev:server
```

Sin ninguna API key, el sistema usa el cerebro heurístico (misma lógica de scoring, cero latencia). El botón «IA» de la cabecera muestra el motor activo (`heuristic` / `claude` / `openrouter`).

### Despliegue

Tres caminos válidos, no excluyentes: `vercel.json` (cliente estático), `render.yaml` (full-stack) o **InsForge Compute** (contenedor Fly.io gestionado por InsForge, usando el `Dockerfile` de la raíz — `npx @insforge/cli compute deploy . --name dj-ia --port 4000 --env-file <.env fuera del repo>`). Detalle completo, incluido cómo se provisiona `OPENROUTER_API_KEY` vía `npx @insforge/cli ai setup`, en `docs/HANDOFF.md §8`.

## 🧠 Cómo piensa el DJ

1. **Candidatos**: la memoria del set filtra la biblioteca (géneros activos, sin repetidos, artistas recientes penalizados).
2. **Objetivo de energía**: `EnergyNarrative` combina el arco del modo (p. ej. Discoteca: calentamiento → pico → aterrizaje), el estado narrativo actual y el bias manual.
3. **Scoring** (compartido cliente/servidor): armonía Camelot 24% · tempo 22% · ajuste de energía 24% · frescura 12% · género 6% · popularidad×personalidad 7% · mood 5% · tendencia regional×personalidad 8% + caos controlado según el riesgo de la personalidad.
4. **Transición**: se elige entre las 13 según compatibilidad armónica mínima, delta de energía y preferencias de la personalidad; el plan (tipo, beats, punto de entrada, razonamiento) se ejecuta como automatización de audio.
5. **Preparación**: el siguiente tema se renderiza/carga en el deck libre con antelación; la transición se dispara automáticamente en la ventana planificada.

## 🔌 API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Estado del servidor |
| GET | `/api/ai/status` | Motor de IA activo |
| POST | `/api/ai/plan-next` | Decide siguiente tema + transición |
| GET | `/api/trends/regions` | Regiones con chart dedicado |
| GET | `/api/trends/:region` | Top trending de una región (Deezer, `?refresh=1` fuerza refetch) |
| GET | `/api/library` | Lista de pistas |
| POST | `/api/library/upload` | Subir audio (multipart `file`) |
| PATCH | `/api/library/:id` | Actualizar análisis de una pista |
| GET | `/api/library/:id/smart-playlist` | Playlist inteligente por armonía/BPM/energía |
| GET/POST | `/api/sessions` | Listar / guardar sesiones |
| DELETE | `/api/sessions/:id` | Borrar sesión |

## 🧩 Extender

- **Nuevo género**: una entrada en `shared/src/constants/genres.ts` (rango de BPM/energía, moods, color, sabor de síntesis).
- **Nueva transición**: definición en `shared/src/constants/transitions.ts` + su automatización en `client/src/audio/AudioEngine.ts`.
- **Nuevo motor de IA**: implementa `DJPlanner` en `server/src/services/ai/` y regístralo en el array de `index.ts`. Reutiliza `AGENT_TOOLS`/`buildAgentPrompt`/`finalizePlan` de `tools.ts` para heredar el bucle de agente y las herramientas gratis (ver `openRouterPlanner.ts` como ejemplo de un segundo transporte para el mismo agente).
- **Nueva tool del agente**: añádela a `AGENT_TOOLS` en `server/src/services/ai/tools.ts` — la recogen automáticamente todos los planificadores basados en agente.
- **Nueva región de tendencias**: añade su playlist "Top &lt;País&gt;" de Deezer a `REGION_PLAYLISTS` en `server/src/services/trends/regions.ts` (búscala con `/search/playlist?q=Top+<País>`).
