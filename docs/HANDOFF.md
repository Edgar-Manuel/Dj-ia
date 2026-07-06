# 🛠️ Handoff — dónde está el proyecto y cómo seguir

> Documento para retomar el trabajo en casa (portátil + Claude Code en terminal).
> Fecha: 2026-07-06. Rama de trabajo: **`claude/insforge-music-generation-p3m1tw`**
> (repo `Edgar-Manuel/Dj-ia`). Todo lo descrito aquí está **commiteado y pusheado**.

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

## 2. Lo que YA está hecho (Fases 1 y 2)

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

### Tests y estado
- `shared/tests/dsp.test.mjs` + `shared/tests/critique.test.mjs` → **15 tests,
  todos verdes** (`npm test -w @ai-dj/shared`).
- `npm run typecheck` y `npm run build` verdes en los 3 workspaces.

---

## 3. Restricción del entorno (importante)

Este trabajo se hizo en **Claude Code on the web**, cuyo entorno tiene una
**política de red que bloquea las APIs externas** (Deezer, YouTube, etc. dan
`403` en el proxy; solo hay salida a npm/pypi/github/anthropic). Por eso **todo
lo hecho es local y testeable sin red**, y las partes que dependen de servicios
externos quedaron pendientes a propósito: en tu portátil, con red abierta y
claves, sí se pueden construir y probar.

---

## 4. Por dónde continuar (siguiente sesión con Claude Code)

Orden sugerido por impacto/dependencias. Cada bloque es una tarea que puedes
pedirle a Claude Code directamente.

### A) Tendencias por país — el "oído" del agente  ⭐ empezar por aquí
El chart de Deezer no necesita auth y da top por país (artista/título/preview).
> Prompt sugerido: *"Implementa un TrendsService en el server con un proveedor
> Deezer (charts por país, sin auth) + caché TTL + fallback honesto cuando no
> haya red, expuesto en `/api/trends/:region`. Añade el parser con tests de
> fixtures. Cablea un `TrendProfile` opcional al scoring para dar boost a las
> pistas subidas cuyo artista esté trending. En casa hay red, así que verifica
> el fetch en vivo."*
- Nota: Deezer **no** da BPM/key, así que el valor real de las tendencias es
  alimentar la generación (D) y las descargas (C), no tanto la selección.
- Ficheros nuevos previstos: `server/src/services/trends/{provider,deezerProvider,trendsService}.ts`,
  ruta en `server/src/routes/`, tipos + `trendBoost` en `shared/src/trends/`.

### B) Framework de tools del agente + tool-calling
Convertir `server/src/services/ai/claudePlanner.ts` en un agente con
herramientas (registro de tools tipadas). La **primera tool es la crítica que ya
existe** (`critiqueMix`), más `get_trends` (de A). Requiere `ANTHROPIC_API_KEY`.
> Prompt: *"Monta un registro de tools en el server y haz que el ClaudePlanner
> llame herramientas: `critique_mix` (ya implementada en shared), `get_trends`,
> `get_library`. Loop de agente que planifica → critica con la tool → corrige."*

### C) Descargas (yt-dlp / spotDL) — tool de adquisición
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
  dj/scoring.ts         # scoring + planTransition (cuantizado a frases)
  types.ts              # Track (con beatgrid, lufs), TransitionPlan, etc.
server/src/
  services/ai/          # DJPlanner: heuristicPlanner + claudePlanner  ← extender a agente (§4B)
  store/jsonStore.ts    # persistencia (interfaz lista para InsForge, §4E)
  routes/               # library, sessions, ai  ← añadir trends (§4A)
client/src/
  audio/analysis.ts     # análisis de subidas (usa el DSP de shared)
  audio/Deck.ts         # deck: trim LUFS + sync de tempo + fase
  audio/AudioEngine.ts  # consola de mezcla: executeTransition(when)
  dj/DJBrain.ts         # ⭐ bucle decide() con crítica
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
