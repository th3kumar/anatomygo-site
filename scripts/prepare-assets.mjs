import { cp, mkdir } from 'node:fs/promises';
// Existing tracked model files remain the single local copy used by both builds.
await mkdir('public', { recursive: true });
await cp('models', 'public/models', { recursive: true });
