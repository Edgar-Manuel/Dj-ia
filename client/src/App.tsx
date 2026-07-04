import { motion } from 'framer-motion';
import { Header } from './components/Header';
import { Visualizer } from './components/Visualizer';
import { DeckPanel } from './components/DeckPanel';
import { Crossfader } from './components/Crossfader';
import { TransportControls } from './components/TransportControls';
import { EnergyMeter } from './components/EnergyMeter';
import { NextTrackCard } from './components/NextTrackCard';
import { HistoryList } from './components/HistoryList';
import { GenreSelector } from './components/GenreSelector';
import { ModeSelector } from './components/ModeSelector';
import { LibraryPanel } from './components/LibraryPanel';

export default function App() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 py-4 flex flex-col gap-4">
      <Header />

      <Visualizer />

      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(320px,380px)_1fr] gap-4 items-start"
      >
        <DeckPanel deckId="A" />

        <section className="panel p-4 flex flex-col gap-5">
          <Crossfader />
          <TransportControls />
          <EnergyMeter />
          <NextTrackCard />
        </section>

        <DeckPanel deckId="B" />
      </motion.main>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="flex flex-col gap-4">
          <GenreSelector />
          <ModeSelector />
        </div>
        <HistoryList />
        <LibraryPanel />
      </div>

      <footer className="text-center text-[10px] text-slate-600 py-2 font-mono">
        AI DJ · Web Audio Engine · Camelot harmonic mixing · Arquitectura IA modular (heurística / Claude)
      </footer>
    </div>
  );
}
