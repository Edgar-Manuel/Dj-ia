import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

/**
 * Minimal atomic-ish JSON file persistence. Good enough for a single-node
 * deployment; swap for a real database behind the same interface when needed.
 */
export class JsonStore<T> {
  private cache: T | null = null;
  private writing: Promise<void> = Promise.resolve();

  constructor(private readonly path: string, private readonly initial: T) {}

  async read(): Promise<T> {
    if (this.cache !== null) return this.cache;
    try {
      const raw = await readFile(this.path, 'utf-8');
      this.cache = JSON.parse(raw) as T;
    } catch {
      this.cache = this.initial;
    }
    return this.cache;
  }

  async write(data: T): Promise<void> {
    this.cache = data;
    this.writing = this.writing.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path, JSON.stringify(data, null, 2), 'utf-8');
    });
    return this.writing;
  }

  async update(fn: (data: T) => T): Promise<T> {
    const next = fn(await this.read());
    await this.write(next);
    return next;
  }
}
