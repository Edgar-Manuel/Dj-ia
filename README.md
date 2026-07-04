# 🎧 AI DJ — Autonomous Mixing Intelligence

Aplicación web completa donde una IA actúa como **DJ profesional autónomo**: decide qué canción reproducir, cuándo mezclar, cuánto dura la transición, qué efectos usar y cómo evoluciona la energía del set durante horas, sin intervención del usuario.

![stack](https://img.shields.io/badge/stack-React%20%2B%20TypeScript%20%2B%20Web%20Audio%20%2B%20Express-22d3ee)

## ✨ Características

- **Modo automático IA**: selección continua por mezcla armónica (rueda Camelot), distancia de BPM, trayectoria de energía, popularidad, mood y memoria del set (sin repetir temas ni abusar de artistas).
- **Motor de audio real** (Web Audio API): dos decks con EQ de 3 bandas, filtros, delay con feedback, reverb por convolución, crossfader equal-power y limitador master.
- **13 transiciones profesionales**: beatmatch, EQ mix, echo out, filter sweep, loop transition, reverb, delay throw, backspin, drop mix, smooth/long/quick blend y double drop — con automatización de parámetros sample-accurate.
- **Narrativa de energía**: 9 estados (Muy relajado → Pico máximo → Final épico) gobernados por el arco del modo de sesión.
- **10 modos de sesión** (Fiesta, Bar, Discoteca, Relax, Trabajo, Gym, Viaje, After, Sunset, Amanecer) y **8 personalidades de DJ** (Comercial, Underground, Festival, Techno, House, Radio, Lounge, Experimental) que cambian riesgo, duración de blends y transiciones favoritas.
- **28 géneros** — añadir uno nuevo = añadir una entrada en `shared/src/constants/genres.ts`.
- **Biblioteca demo sintetizada**: ~170 pistas generadas proceduralmente por el navegador (kick, bajo, pads, arps según género/tonalidad/BPM), estructuradas en secciones (intro/build/drop/break/outro) que la IA usa para elegir puntos de mezcla.
- **Subida de canciones** con análisis real en el navegador: BPM (autocorrelación de onsets), tonalidad Camelot (chroma + perfiles Krumhansl) y energía (RMS/loudness).
- **Visualizador 60 FPS**: espectro, partículas y luces sincronizadas con el beat.
- **Sesiones**: guardar/cargar con historial completo.
- **Arquitectura IA modular**: cerebro heurístico local (offline-first) + planificador **Claude** opcional en el backend (`ANTHROPIC_API_KEY`), con fallback automático.

## 🏗️ Arquitectura

```
ai-dj/
├── shared/   # Tipos + dominio musical (Camelot, géneros, energía, scoring) — usado por cliente y servidor
├── server/   # Express + TypeScript: biblioteca, sesiones, endpoint IA /api/ai/plan-next
│   └── services/ai/   # DJPlanner: HeuristicPlanner + ClaudePlanner (conectable a otros modelos)
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

### Activar el planificador Claude (opcional)

```bash
export ANTHROPIC_API_KEY=sk-ant-...
# opcional: export AI_DJ_CLAUDE_MODEL=claude-opus-4-8
npm run dev:server
```

Sin API key, el sistema usa el cerebro heurístico (misma lógica de scoring, cero latencia). El botón «IA» de la cabecera muestra el motor activo.

## 🧠 Cómo piensa el DJ

1. **Candidatos**: la memoria del set filtra la biblioteca (géneros activos, sin repetidos, artistas recientes penalizados).
2. **Objetivo de energía**: `EnergyNarrative` combina el arco del modo (p. ej. Discoteca: calentamiento → pico → aterrizaje), el estado narrativo actual y el bias manual.
3. **Scoring** (compartido cliente/servidor): armonía Camelot 24% · tempo 22% · ajuste de energía 24% · frescura 12% · género 6% · popularidad×personalidad 7% · mood 5% + caos controlado según el riesgo de la personalidad.
4. **Transición**: se elige entre las 13 según compatibilidad armónica mínima, delta de energía y preferencias de la personalidad; el plan (tipo, beats, punto de entrada, razonamiento) se ejecuta como automatización de audio.
5. **Preparación**: el siguiente tema se renderiza/carga en el deck libre con antelación; la transición se dispara automáticamente en la ventana planificada.

## 🔌 API

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/health` | Estado del servidor |
| GET | `/api/ai/status` | Motor de IA activo |
| POST | `/api/ai/plan-next` | Decide siguiente tema + transición |
| GET | `/api/library` | Lista de pistas |
| POST | `/api/library/upload` | Subir audio (multipart `file`) |
| PATCH | `/api/library/:id` | Actualizar análisis de una pista |
| GET | `/api/library/:id/smart-playlist` | Playlist inteligente por armonía/BPM/energía |
| GET/POST | `/api/sessions` | Listar / guardar sesiones |
| DELETE | `/api/sessions/:id` | Borrar sesión |

## 🧩 Extender

- **Nuevo género**: una entrada en `shared/src/constants/genres.ts` (rango de BPM/energía, moods, color, sabor de síntesis).
- **Nueva transición**: definición en `shared/src/constants/transitions.ts` + su automatización en `client/src/audio/AudioEngine.ts`.
- **Nuevo motor de IA**: implementa `DJPlanner` en `server/src/services/ai/` y regístralo en el array de `index.ts` (OpenAI, modelos locales, etc.).
