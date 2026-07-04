import { createApp } from './app.js';

const port = Number(process.env.PORT) || 4000;

createApp().listen(port, () => {
  console.log(`⚡ AI DJ server listening on http://localhost:${port}`);
  console.log(
    process.env.ANTHROPIC_API_KEY
      ? '🧠 Claude planner enabled (ANTHROPIC_API_KEY detected)'
      : '🧠 Heuristic planner active (set ANTHROPIC_API_KEY to enable Claude)',
  );
});
