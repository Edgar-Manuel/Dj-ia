# 🚀 Brainstorm: AI DJ x10 — De "IA que genera" a agente autónomo que produce

> Sesión de ideas 2026-07-05. Contexto: InsForge ya conectado, pero la música
> generada es genérica, los tempos no cuadran y las mezclas no convencen.
> Objetivo: multiplicar x10 la calidad convirtiendo el sistema en un **agente
> autónomo con herramientas**, no un simple generador.

---

## 1. Diagnóstico: por qué suena genérico y los tempos fallan

| Síntoma | Causa raíz en el código actual |
|---|---|
| Música genérica | Generación one-shot texto→audio sin control de BPM/tonalidad/estructura, y biblioteca demo sintetizada (`client/src/audio/synth.ts`) con patrones fijos por género |
| Tempos mal llevados | `detectBpm()` en `client/src/audio/analysis.ts` usa autocorrelación de onsets: sufre errores de octava (detecta 87 en vez de 174, o el doble) y **no hay beatgrid**: solo un BPM escalar, sin posición del beat 1 ni de los downbeats → el beatmatch alinea tempos pero no fases ni frases |
| Mezclas flojas | Sin stems (los graves de dos temas chocan aunque se corte EQ), sin time-stretch de calidad (cambiar `playbackRate` altera el pitch), sin cuantización a frases de 16/32 compases, sin normalización de loudness entre pistas |
| Sin criterio "actual" | El sistema no sabe qué está sonando ahora en ningún país: elige por scoring interno sobre una biblioteca estática |

**La idea fuerza del x10:** hoy el flujo es abierto (generar → reproducir).
Hay que **cerrar el bucle**: generar → analizar objetivamente (BPM, key,
estructura, energía reales) → criticar → regenerar o descartar. Un agente con
tools puede hacer ese ciclo solo.

---

## 2. Arquitectura propuesta: el agente DJ autónomo

Un loop de agente (Claude Agent SDK / tool-use sobre el Model Gateway de
InsForge) que actúa como **A&R + productor + DJ residente**, con estas tools:

```
┌─────────────────────── AGENTE DJ ───────────────────────┐
│                                                          │
│  search_trends(país, género)   → charts en tiempo real   │
│  search_youtube(query)         → YouTube Data API        │
│  download_track(url/query)     → yt-dlp / spotDL         │
│  download_samples(query)       → Freesound API (CC0)     │
│  analyze_track(file)           → beatgrid, key, estructura│
│  separate_stems(file)          → Demucs (voz/bajo/batería)│
│  generate_music(spec)          → InsForge/ACE-Step con    │
│                                  BPM, key y estructura    │
│  critique_track(file, spec)    → re-análisis + veredicto  │
│  library_crud(...)             → biblioteca en InsForge DB│
│  plan_set(modo, arco)          → planificación del set    │
│                                                          │
│  BUCLE: genera/descarga → analiza → critica → corrige    │
└──────────────────────────────────────────────────────────┘
```

Puntos clave:

- **El agente decide, las tools ejecutan.** El LLM no "hace música": elige
  qué descargar, qué generar, con qué spec, y valida el resultado con datos
  medidos (no con su propia opinión).
- **Conocimiento de tendencias por territorio:** antes de planificar un set de
  techno, consulta qué suena en Berlín; para reggaetón, en Puerto Rico/España;
  para hip-hop, en EEUU. Cache diario vía cron/edge function de InsForge.
- **Auto-crítica medible:** si pidió 128 BPM en 8A y el análisis devuelve
  126.3 BPM en 9B, regenera o ajusta con time-stretch/pitch-shift. Genérico =
  no pasa el filtro (p. ej. varianza espectral baja, estructura plana).
- **InsForge como backend del agente:** Postgres (biblioteca, análisis
  cacheados, historial de sets), Storage (audio y stems), Edge Functions
  (workers de análisis/descarga), Model Gateway (LLM del agente).

---

## 3. Fuentes de contenido real (tools de adquisición)

| Tool | Repo/API | Nota |
|---|---|---|
| Descarga YouTube | [yt-dlp/yt-dlp](https://github.com/yt-dlp/yt-dlp) | El estándar. CLI o binding python |
| Descarga por metadata Spotify | [spotDL/spotify-downloader](https://github.com/spotDL/spotify-downloader) | Busca el match en YouTube y baja con carátula y metadata |
| YouTube Data API v3 | oficial | `videos.list?chart=mostPopular&videoCategoryId=10&regionCode=DE` → lo más visto en música por país |
| Samples libres | Freesound API, [Stable Audio Open](https://github.com/Stability-AI/stable-audio-tools) (entrenado en Freesound) | Samples CC0 legales para capas y FX |
| Transcripciones/letras | [jdepoix/youtube-transcript-api](https://github.com/jdepoix/youtube-transcript-api) *(ya está en tu base 3d64r3p0s)* | Para que el agente "entienda" letras y las use en generación con vocals |

⚠️ **Legal:** descargar audio de YouTube/Spotify va contra sus ToS salvo
contenido propio o Creative Commons. Para el producto: usar descargas solo en
local/desarrollo, y en producción tirar de charts + previews de 30s (Deezer/
iTunes API dan previews legales) + generación propia + Freesound.

## 4. Tendencias por país (el "oído" del agente)

- **Billboard**: [guoguo12/billboard-charts](https://github.com/guoguo12/billboard-charts) (Python) o [darthbatman/billboard-top-100](https://github.com/darthbatman/billboard-top-100) (Node) — Hot 100, Global 200
- **Spotify Charts**: charts.spotify.com tiene CSV por país (Top 50 diario/semanal)
- **Deezer API**: `api.deezer.com/chart/0?limit=50` por país, **sin auth y con previews de 30s** → probablemente la mejor primera integración
- **Last.fm**: `geo.getTopTracks(country)` — gratuito con API key
- **Beatport Top 100 por subgénero** (electrónica: la referencia real de DJs) y **1001Tracklists** (qué están pinchando los DJs de verdad en sets) — scraping ligero
- **iTunes RSS**: feeds de top songs por país, sin auth

El agente cruza estas fuentes: "en Alemania esta semana el techno duro a
150 BPM domina Beatport, y en los sets de Amelie Lens suena X" → eso alimenta
tanto la selección como los prompts de generación.

---

## 5. Motor musical: arreglar tempos y mezclas de verdad

1. **Beatgrid real, no BPM escalar.** Sustituir/complementar `analysis.ts` con:
   - [essentia.js](https://github.com/MTG/essentia.js) (WASM, corre en el navegador): RhythmExtractor2013, KeyExtractor — algoritmos de nivel industrial
   - En servidor: [madmom](https://github.com/CPJKU/madmom) (DBN downbeat tracking, el estado del arte en localizar el beat 1) o [librosa](https://github.com/librosa/librosa)
   - Guardar **beatgrid completo** (offset del primer beat + posiciones de downbeats) en la DB de InsForge, no solo el número
2. **Estructura por secciones con ML:** [mir-aidj/all-in-one](https://github.com/mir-aidj/all-in-one) — modelo pensado justo para DJs: segmenta intro/verse/chorus/outro + beats + downbeats de una pasada. Las transiciones se cuantizan a frases de 16/32 compases y se disparan en fronteras de sección.
3. **Time-stretch sin chipmunk:** [Signalsmith Stretch](https://github.com/Signalsmith-Audio/signalsmith-stretch) (C++ con build WASM, ideal para Web Audio) o [rubberband](https://github.com/breakfastquay/rubberband) en servidor. Sincronizar tempos preservando pitch.
4. **Stems en la mezcla:** [facebookresearch/demucs](https://github.com/facebookresearch/demucs) o su empaquetado [python-audio-separator](https://github.com/nomadkaraoke/python-audio-separator). Desbloquea las técnicas que hacen que una mezcla suene "pro":
   - acapella del tema B sobre instrumental del tema A antes del corte
   - swap de graves real (mutear stem de bajo, no solo EQ)
   - double drops sin barro en el low-end
5. **Loudness matching EBU R128** entre pistas (medir LUFS al analizar, compensar gain por deck) — media mezcla mala es solo diferencia de volumen.
6. **Referencia de código:** [mixxxdj/mixxx](https://github.com/mixxxdj/mixxx) — DJ software open source maduro; su código de beatgrid, sync y quantize es oro para copiar decisiones de diseño.

## 6. Generación menos genérica

- **Modelos self-host controlables** (vía GPU propia o API, orquestados por el agente):
  - [ace-step/ACE-Step](https://github.com/ace-step/ACE-Step) — foundation model de música (v1.5, enero 2026); soporta letras, control fino, *repainting* (regenerar solo una sección) y edición. El candidato nº 1 para sustituir/complementar la generación actual
  - [multimodal-art-projection/YuE](https://github.com/multimodal-art-projection/YuE) — letra→canción completa con voces
  - [facebookresearch/audiocraft](https://github.com/facebookresearch/audiocraft) (MusicGen) — acepta **melodía de referencia** como condición: genera "al estilo de" un tema trending sin copiarlo
  - [Stability-AI/stable-audio-tools](https://github.com/Stability-AI/stable-audio-tools) — samples/loops/FX con licencia clara
- **Specs de generación estructuradas, no prompts sueltos:** el agente redacta `{bpm: 128, key: "8A", estructura: [intro 16, build 16, drop 32...], referencia: <tema trending>, subgénero: "melodic techno tipo Afterlife"}` y la tool lo traduce al modelo. El vocabulario del prompt sale de las tendencias reales (§4).
- **Generación por capas:** primero el LLM compone plan/acordes/groove en MIDI, luego se renderiza — mucho menos genérico que text-to-audio directo.
- **Uso quirúrgico de la generación:** en vez de generar temas enteros (donde se nota lo genérico), generar **transiciones, bridges, intros/outros y capas** entre temas reales. La generación rellena huecos del set; el contenido real lleva el peso.

---

## 7. Mejoras de la app en sí

- **Migrar `server/src/store/jsonStore.ts` → InsForge Postgres** (biblioteca, sesiones, análisis, historial del agente). Storage de InsForge para los audios/stems.
- **Consola del agente en la UI:** stream (WebSocket/SSE) de lo que el agente hace: "buscando top 50 de Alemania… bajando 3 candidatos… el 2º falla el filtro de key…". Convierte la caja negra en el show.
- **Explorador de tendencias:** pestaña con los charts por país que consume el agente, para que el usuario dirija ("céntrate en UK garage").
- **Waveforms navegables** con [wavesurfer.js](https://github.com/katspaugh/wavesurfer.js) mostrando beatgrid y secciones detectadas; editor manual de puntos de mezcla como fallback.
- **Feedback humano en el loop:** botón 👍/👎 por transición → se guarda en DB → el agente lo usa como memoria de preferencias.
- **Worker de análisis en servidor** (Python: madmom + demucs + librosa como microservicio o edge function pesada) con cache por hash del archivo — el navegador solo para análisis rápido de subidas.

## 8. Repos útiles encontrados en tu base (3d64r3p0s)

De los 472 repos curados de manuagi, los relevantes para esto:

- **[mastra-ai/mastra](https://github.com/mastra-ai/mastra)** (17.9k⭐) — framework de agentes en TypeScript: encaja directo con tu stack Express/TS para el loop del agente (alternativa: Claude Agent SDK)
- **[VoltAgent/voltagent](https://github.com/VoltAgent/voltagent)** (3.8k⭐) — framework de agentes TS con observabilidad integrada
- **[freeman-jiang/beatsync](https://github.com/freeman-jiang/beatsync)** (2.7k⭐) — reproducción sincronizada multi-dispositivo: idea de feature "fiesta en varios móviles a la vez"
- **[jdepoix/youtube-transcript-api](https://github.com/jdepoix/youtube-transcript-api)** (6.4k⭐) — letras/transcripciones desde YouTube
- **[boson-ai/higgs-audio](https://github.com/boson-ai/higgs-audio)** (7.5k⭐) — foundation model texto-audio, para voz de "MC/locutor" del DJ entre temas
- **[elevenlabs/ui](https://github.com/elevenlabs/ui)** (1.3k⭐) — componentes shadcn para UIs de audio (waveforms, players): acelera la consola del agente

## 9. Roadmap sugerido (impacto/esfuerzo)

| Fase | Qué | Por qué primero |
|---|---|---|
| **1. Fundamentos de audio** | essentia.js + beatgrid completo + LUFS + cuantización a frases | Es la causa directa de "no lleva bien los tempos". Impacto inmediato sin tocar la generación |
| **2. Agente v1** | Loop con tools: Deezer charts (sin auth) + YouTube Data API + analyze + critique. Persistencia en InsForge | Cierra el bucle generar→medir→corregir y le da "oído" al sistema |
| **3. Stems + time-stretch** | Demucs en worker + Signalsmith WASM en cliente | Las mezclas pasan de "EQ crossfade" a técnicas reales de DJ |
| **4. Generación controlada** | ACE-Step self-host con specs estructuradas; generación quirúrgica (bridges/capas) | Ataca lo "genérico" con control real |
| **5. App/UX** | Consola del agente, explorador de tendencias, waveforms, feedback 👍/👎 | Hace visible (y vendible) todo lo anterior |

---

*Documento generado en sesión de brainstorm. Siguiente paso natural: elegir
fase 1 y bajarla a tareas concretas.*
