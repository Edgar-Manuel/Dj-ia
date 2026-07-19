# 🛠️ Handoff — dónde está el proyecto y cómo seguir

> Documento para retomar el trabajo en casa (portátil + Claude Code en terminal).
> Fecha: 2026-07-06, actualizado 2026-07-19. Rama de trabajo:
> **`claude/ai-dj-web-app-76mrzo`** (repo `Edgar-Manuel/Dj-ia`).

---

## 0. Arranque rápido en casa (copia y pega)

```bash
git clone <url-del-repo> ai-dj && cd ai-dj
git checkout claude/insforge-music-generation-p3m1tw
npm install
npm run build           # compila shared + server + client
npm test -w @ai-dj/shared   # 15 tests del DSP + crítico (deben salir 15 verdes)

# Desarrollo (2 terminales):
npm run dev:server      # API en http://localhost:4000
npm run dev:client      # UI en http://localhost:5173

# Opcional: activar el planificador Claude en el server
export ANTHROPIC_API_KEY=sk-ant-...
```

Luego abre Claude Code en la raíz del repo y sigue por la sección **§4 (Por dónde continuar)**.

---

## 1. Contexto y objetivo

App: **AI DJ** — un DJ autónomo por IA (React + TS + Web Audio en el cliente,
Express + TS en el server, dominio musical compartido en `shared/`).

El punto de partida era: "conecté InsForge pero hace música **genérica** y **no
lleva bien los tempos ni las mezclas**". El plan x10 (en `docs/BRAINSTORM_X10.md`)
es pasar de "una IA que genera" a un **agente autónomo con tools** que
descarga/genera → **mide** → **critica** → **corrige**, con conocimiento de
tendencias por país. Este handoff cubre lo ya hecho de ese plan.

---

## 2. Lo que YA está hecho (Fases 1, 2 y 3)

### Fase 1 — Motor de audio real (commit `7b6aa30`)
Arregla directamente "no lleva bien los tempos ni las mezclas".

- **`shared/src/audio/tempo.ts`** — detector de beatgrid dependency-free
  (sirve en navegador y en Node): flujo espectral con FFT propia → peine
  armónico que **resuelve el error de octava** (87 vs 174 BPM) → fase del beat
  sobre la banda del kick → downbeat por acento. Devuelve BPM fraccional +
  offsets de beat y downbeat.
- **`shared/src/audio/loudness.ts`** — loudness integrado **EBU R128 / BS.1770**
  (K-weighting para cualquier sample rate, bloques 400 ms, gating). Da LUFS y el
  gain de trim hacia −14 LUFS.
- **`shared/src/audio/beatgrid.ts`** — tipo `Beatgrid` + helpers de cuantización
  a beat / downbeat / frase de 16 beats.
- **`Track`** (en `shared/src/types.ts`) gana `beatgrid` y `lufs`. Las demos
  derivan un grid exacto de su BPM.
- **`client/src/audio/analysis.ts`** — reescrito sobre el DSP compartido.
  (De paso se arregló un bug: el Goertzel de tonalidad solo procesaba los 2
  primeros segundos de la ventana de 60 s.)
- **`client/src/audio/Deck.ts`** — trim automático de loudness a −14 LUFS,
  **sync de tempo real** (playbackRate con contabilidad exacta de posición bajo
  ramps, y vuelta suave al tempo natural tras el blend), `beatPhase()` desde el
  beatgrid.
- **`shared/src/dj/scoring.ts` + `client/src/audio/AudioEngine.ts` +
  `client/src/dj/DJBrain.ts`** — **mezcla cuantizada**: el punto de mezcla se
  cuantiza a frases de 4 compases, la transición dispara en el siguiente
  beat/downbeat del deck saliente, el entrante entra por un downbeat, y hay
  tempo-sync ±8% durante el blend.

### Fase 2 (parcial) — Auto-crítica de mezcla (commit `f630086`)
El núcleo "mide → critica → corrige" del brainstorm, **100% local**.

- **`shared/src/dj/critique.ts`** — `critiqueMix(current, next, plan, opts)`
  juzga una mezcla planificada con datos objetivos: ventana de BPM (rechaza
  saltos fuera de ±8%, admite medio/doble tiempo), choque armónico Camelot
  (lo **enmascara con FX** o lo **rechaza** si el estilo es muy cauto),
  alineación de frase, salto de loudness residual tras el trim, y salto de
  energía. Devuelve `accept` / `adjust` / `reject` + `issues`.
- **`client/src/dj/DJBrain.ts`** — `decide()` recorre el crate best-first,
  planifica y critica cada candidato, y toma el **primero cuyo veredicto no sea
  `reject`** aplicando la corrección. También **vetea la elección del
  servidor/Claude** (un `reject` cae al cerebro local). La nota se expone en el
  store (`lastCritique`) y se muestra en `NextTrackCard`.

### Fase 3 — Tendencias por país + agente con tools (2026-07-19, con red abierta)
Bloques **A y B** del plan ×10 (`docs/BRAINSTORM_X10.md §2/§4`), hechos y
**verificados en vivo** contra la API pública de Deezer y el catálogo de
OpenRouter (esta sesión sí tuvo red abierta — ver nota actualizada en §3).

- **`shared/src/trends/{types,boost}.ts`** — `TrendProfile`/`TrendTrack` y
  `trendBoost(track, profile)`: 0..1 según si el artista está trending
  (match tolerante a acentos/mayúsculas/substring), ponderado por posición
  en el chart. Cableado en `shared/src/dj/scoring.ts` con el mismo peso de
  personalidad que la popularidad (`trend * personality.popularityWeight *
  0.08`) — un DJ comercial/radio persigue tendencias, uno underground/techno
  casi las ignora. `PlanNextRequest.trendProfile` es opcional; sin él, boost
  = 0 (no rompe nada existente).
- **`server/src/services/trends/`** — `regions.ts` (22 regiones: playlists
  editoriales "Top &lt;País&gt;" de Deezer, resueltas a mano vía
  `/search/playlist?q=Top+<País>` porque la API pública no tiene chart
  parametrizado por país; `global` usa `/chart/0/tracks` nativo),
  `deezerProvider.ts` (fetch + `parseDeezerTracks` puro, testeado con
  fixtures reales en `server/tests/fixtures/`), `trendsService.ts` (caché
  TTL 30 min en memoria, fallback honesto — sirve el último dato válido o un
  perfil vacío `source: "fallback"`, nunca inventa). Ruta `GET
  /api/trends/:region` (+ `/api/trends/regions`) en `server/src/routes/trends.ts`.
- **`server/src/services/ai/tools.ts`** — registro de tools compartido por
  cualquier planner-agente: `get_trends`, `get_library` (busca en toda la
  biblioteca, no solo el shortlist), `critique_mix` (reusa la auto-crítica
  de la Fase 2 sobre la pista que el LLM proponga) y la tool terminal
  `submit_plan`. También el prompt de sistema y el builder del turno inicial,
  para que todos los planners-agente compartan comportamiento.
- **`server/src/services/ai/claudePlanner.ts`** — reescrito de una llamada
  JSON de un solo turno a un **loop de agente** (hasta 6 turnos; el último
  fuerza `tool_choice: submit_plan` para garantizar terminación): el modelo
  llama tools, ve los resultados, y el prompt de sistema le exige haber
  llamado `critique_mix` con veredicto ≠ `reject` antes de poder terminar.
- **`server/src/services/ai/openRouterPlanner.ts`** *(nuevo)* — el mismo
  agente y las mismas tools, pero hablando con
  `https://openrouter.ai/api/v1/chat/completions` (formato OpenAI de tool
  calling) en vez de la API de Anthropic directa. Se activa con
  `OPENROUTER_API_KEY`; modelo por defecto `anthropic/claude-opus-4.8`
  (`AI_DJ_OPENROUTER_MODEL` para cambiarlo — verificar el slug exacto en
  `https://openrouter.ai/api/v1/models`, el catálogo cambia). Útil para
  correr el planificador LLM sin una key directa de Anthropic.
- **`server/src/services/ai/index.ts`** — orden de fallback:
  **openrouter → claude → heurístico**; el primero disponible (`isAvailable()`)
  gana, y cualquier error del agente (turnos agotados, red, JSON inválido)
  cae al siguiente.
- **Cliente**: `api.getTrends(region)`, `store.trendRegion`/`trendProfile`
  (`DJState`), y `DJBrain.ensureTrendProfile()` — refresca el perfil (TTL
  10 min en cliente, encima del TTL de 30 min del server) antes de cada
  `decide()` y lo mete en `PlanNextRequest.trendProfile`. **Pendiente**: no
  hay selector de región en la UI — usa el default `'global'` hasta que se
  aborde el bloque F (explorador de tendencias).

### Tests y estado
- `shared/tests/dsp.test.mjs` + `shared/tests/critique.test.mjs` → **15 tests,
  todos verdes** (`npm test -w @ai-dj/shared`).
- `server/tests/trends.test.mjs` (parser de Deezer contra fixtures reales) →
  **5 tests, todos verdes** (`npm test -w @ai-dj/server`).
- `npm run typecheck` y `npm run build` verdes en los 3 workspaces.
- **Verificado en producción (2026-07-19)**: tras desplegar a InsForge
  Compute (ver §8), un `POST /api/ai/plan-next` real devolvió
  `"engine": "openrouter"` y el agente **llamó `get_trends` por iniciativa
  propia** (sin que el request pidiera tendencias) y **`critique_mix` antes
  de decidir** — la razón devuelta lo dice explícitamente: *"Quevedo está
  pegando fuerte en las tendencias de España ahora mismo... Veredicto de
  critique_mix: accept sin incidencias"*. El bucle de agente funciona
  end-to-end tal como se diseñó.

## 8. Desplegado en InsForge Compute (2026-07-19)

La app corre como contenedor en InsForge Compute (Fly.io por debajo, gestionado
por InsForge — nunca uses `flyctl` directo con tus propias credenciales, la
cuenta de Fly es de InsForge):

- **Proyecto InsForge**: `Dj-ia` (`a09b61f4-035b-41bd-a53f-b67216d5d114`),
  org personal, región `eu-central`.
- **Servicio compute**: `dj-ia` (`7a8d07b8-e98b-4829-89a2-326fdc793df5`).
- **Endpoint**: https://dj-ia-a09b61f4-035b-41bd-a53f-b67216d5d114.fly.dev
- **`Dockerfile`** (nuevo, raíz del repo): build multi-stage que preserva la
  disposición de carpetas del monorepo (necesaria porque `app.ts` sirve
  `client/dist` con una ruta relativa a `server/dist`, y `@ai-dj/shared` se
  consume vía el symlink de npm workspaces).
- **Variables de entorno del contenedor**: `OPENROUTER_API_KEY` (provisionada
  por InsForge, ver `npx @insforge/cli ai setup` — no es una cuenta de
  OpenRouter propia) + `AI_DJ_OPENROUTER_MODEL=anthropic/claude-opus-4.8` +
  `NODE_ENV=production`.
- **Redeploy** tras cambios de código:
  ```bash
  npx @insforge/cli compute deploy . --name dj-ia --port 4000 --env-file <archivo-fuera-del-repo>
  ```
  (usa el mismo `--name` para actualizar el servicio existente en vez de
  crear uno nuevo).
- **Rotar/añadir una env var sin perder las demás**:
  ```bash
  npx @insforge/cli compute update 7a8d07b8-e98b-4829-89a2-326fdc793df5 --env-set NUEVA_KEY=valor
  ```
- **Logs**: `npx @insforge/cli logs insforge.logs` (o el dashboard del
  proyecto).
- ⚠️ Servicios compute están en **private preview** de InsForge — la API,
  cuotas y flags pueden cambiar entre releases.

Este es un tercer camino de despliegue junto a `vercel.json` (cliente
estático) y `render.yaml` (full-stack) — no se han retirado, siguen siendo
válidos si en algún momento prefieres esas plataformas.

---

## 3. Restricción del entorno (importante — ya no aplica siempre)

Las Fases 1-2 (2026-07-06) se hicieron en **Claude Code on the web**, cuyo
entorno tenía una **política de red que bloqueaba las APIs externas** (Deezer,
YouTube, etc. daban `403` en el proxy; solo había salida a npm/pypi/github/
anthropic). Por eso quedó todo local y testeable sin red, y lo que dependía de
servicios externos se dejó pendiente a propósito.

La Fase 3 (2026-07-19) sí corrió con **red abierta** (entorno local en
Windows) y verificó Deezer y el catálogo de OpenRouter en vivo — ver §2. Lo
que sigue pendiente (`ANTHROPIC_API_KEY`/`OPENROUTER_API_KEY` en vivo, C/D/E)
no es por restricción de red sino porque falta la key o es la siguiente tarea
a abordar.

---

## 4. Por dónde continuar (siguiente sesión con Claude Code)

Orden sugerido por impacto/dependencias. **A y B ya están hechos** (§2, Fase
3) — arranca por C.

### C) Descargas (yt-dlp / spotDL) — tool de adquisición  ⭐ empezar por aquí
> Prompt: *"Añade una tool `download_track(url|query)` que use yt-dlp/spotDL en
> un worker del server, guarda el audio y lo pasa por `analyzeBuffer` para
> rellenar beatgrid+lufs, y lo mete en la biblioteca."*
- ⚠️ Legal: bajar de YouTube/Spotify va contra sus ToS salvo contenido propio o
  CC. Para producción: previews legales (Deezer/iTunes) + Freesound (CC0) +
  generación propia.

### D) Generación controlada (ataca lo "genérico")
Sustituir/complementar la generación InsForge con **specs estructuradas**
(`{bpm, key, estructura, referencia}`) en vez de prompts sueltos, y generar
**quirúrgicamente** (bridges/intros/outros/capas entre temas reales) en vez de
temas enteros. Candidato nº1: **ACE-Step** (self-host). Ver `docs/BRAINSTORM_X10.md §6`.

### E) Migrar persistencia a InsForge
`server/src/store/jsonStore.ts` está detrás de una interfaz simple
(`read/write/update`) — se puede cambiar por Postgres de InsForge sin tocar los
servicios. Storage de InsForge para audios/stems.

### F) Mejoras de UX (ver `docs/BRAINSTORM_X10.md §7`)
Consola en vivo del agente (SSE/WebSocket), explorador de tendencias, waveforms
navegables con beatgrid (wavesurfer.js), feedback 👍/👎 → memoria de preferencias.

---

## 5. Mapa de ficheros clave

```
shared/src/
  audio/tempo.ts        # detector de beatgrid (BPM/fase/downbeat) — dependency-free
  audio/loudness.ts     # LUFS EBU R128 + trim gain
  audio/beatgrid.ts     # tipo Beatgrid + cuantización a beat/downbeat/frase
  dj/critique.ts        # ⭐ auto-crítica de mezcla (accept/adjust/reject)
  dj/scoring.ts         # scoring + planTransition (cuantizado a frases; incluye trendBoost)
  trends/{types,boost}.ts  # TrendProfile/TrendTrack + trendBoost()
  types.ts              # Track (con beatgrid, lufs), TransitionPlan, PlanNextRequest.trendProfile, etc.
server/src/
  services/ai/tools.ts          # ⭐ registro de tools + prompt de sistema, compartido por todo planner-agente
  services/ai/claudePlanner.ts  # agente vía Anthropic directo (ANTHROPIC_API_KEY)
  services/ai/openRouterPlanner.ts  # mismo agente vía OpenRouter (OPENROUTER_API_KEY)
  services/ai/index.ts          # fallback en cascada: openrouter → claude → heuristicPlanner
  services/trends/               # TrendsService + DeezerTrendsProvider + regions.ts
  store/jsonStore.ts    # persistencia (interfaz lista para InsForge, §4E)
  routes/               # library, sessions, ai, trends
client/src/
  lib/api.ts             # getTrends(region) además de planNext/library/sessions
  audio/analysis.ts     # análisis de subidas (usa el DSP de shared)
  audio/Deck.ts         # deck: trim LUFS + sync de tempo + fase
  audio/AudioEngine.ts  # consola de mezcla: executeTransition(when)
  dj/DJBrain.ts         # ⭐ bucle decide() con crítica; ensureTrendProfile() antes de cada decisión
  components/NextTrackCard.tsx  # muestra la nota de crítica
docs/
  BRAINSTORM_X10.md     # el plan completo x10 (visión, repos útiles, roadmap)
  HANDOFF.md            # este documento
```

## 6. Repos externos de referencia (del brainstorm)

Motor de audio: [essentia.js](https://github.com/MTG/essentia.js),
[madmom](https://github.com/CPJKU/madmom),
[all-in-one](https://github.com/mir-aidj/all-in-one) (estructura para DJs),
[Signalsmith Stretch](https://github.com/Signalsmith-Audio/signalsmith-stretch),
[demucs](https://github.com/facebookresearch/demucs) (stems),
[mixxx](https://github.com/mixxxdj/mixxx) (referencia de diseño). ·
Generación: [ACE-Step](https://github.com/ace-step/ACE-Step),
[YuE](https://github.com/multimodal-art-projection/YuE),
[audiocraft/MusicGen](https://github.com/facebookresearch/audiocraft). ·
Tendencias/descarga: [Deezer API], [spotDL](https://github.com/spotDL/spotify-downloader),
[yt-dlp](https://github.com/yt-dlp/yt-dlp),
[billboard-charts](https://github.com/guoguo12/billboard-charts). ·
Agentes (en tu base 3d64r3p0s): [mastra](https://github.com/mastra-ai/mastra),
[voltagent](https://github.com/VoltAgent/voltagent).

---

## 7. Notas y limitaciones conocidas

- **Downbeat heurístico**: se localiza por acento de kick por compás; para
  música sin acento claro en el beat 1 puede fallar por un beat. El DSP es
  intercambiable: se puede sustituir por essentia.js / all-in-one sin tocar el
  resto (todo consume `Track.beatgrid`).
- **Tempo-sync sin time-stretch de calidad**: hoy se usa `playbackRate` (altera
  el pitch levemente en el rango ±8%). Para calidad pro, integrar Signalsmith
  Stretch (WASM) — ver `docs/BRAINSTORM_X10.md §5.3`.
- **Tests**: se corren con `node --test` sobre `shared/dist` (por eso `npm test`
  hace `build` antes). Si añades tests, sigue el patrón de los `.mjs` existentes.
