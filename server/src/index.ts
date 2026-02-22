import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { setupWebSocket } from './network/wsHandler.js';
import * as lobbyMgr from './lobby/lobbyManager.js';
import { getDailySeed } from './daily/dailySeed.js';
import { generateCase } from './case/caseGenerator.js';

const PORT = parseInt(process.env.PORT || '4000', 10);
const app = express();
app.use(cors());
app.use(express.json());

// ─── HTTP Endpoints ──────────────────────────────────────────────────────────

// Public lobby list
app.get('/api/lobbies', (_req, res) => {
  const lobbies = lobbyMgr.getPublicLobbies();
  res.json({ lobbies });
});

// Daily case seed
app.get('/api/daily-seed', (_req, res) => {
  const seed = getDailySeed();
  res.json({ seed, date: new Date().toISOString().slice(0, 10) });
});

// Daily case preview
app.get('/api/daily-case', (_req, res) => {
  const seed = getDailySeed();
  const caseData = generateCase({ seed, caseType: 'random', complexity: 'standard' });
  // Only return non-spoiler info
  res.json({
    caseName: caseData.caseName,
    caseType: caseData.caseType,
    location: caseData.location,
    victimName: caseData.victimName,
    suspectCount: caseData.suspects.length,
    seed,
  });
});

// Health
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// ─── Server Start ────────────────────────────────────────────────────────────

const server = http.createServer(app);
setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`🔍 Crime Investigation Server running on port ${PORT}`);
  console.log(`   HTTP: http://localhost:${PORT}`);
  console.log(`   WS:   ws://localhost:${PORT}`);
  console.log(`   Daily seed: ${getDailySeed()}`);
});
