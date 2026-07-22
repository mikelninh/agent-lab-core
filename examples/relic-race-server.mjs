import { serveJsonlEnvironment } from '../jsonl-protocol.mjs';
import { createRelicRaceEnvironment } from './relic-race.mjs';

await serveJsonlEnvironment(createRelicRaceEnvironment());
