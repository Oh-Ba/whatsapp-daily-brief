/**
 * check-voice.js — verifies the TTS chain without calling Anthropic.
 *
 *   npm run check-voice
 *
 * Costs nothing. Confirms piper and ffmpeg are installed, the voice model
 * loads, and an MP3 comes out the other end — before you spend a billed
 * brief generation finding out otherwise.
 */

import fs from "node:fs";
import { config } from "./config.js";
import { synthesize, speakableText, cleanup } from "./tts.js";

console.log(`enabled : ${config.ttsEnabled}`);
console.log(`piper   : ${config.piperBin}`);
console.log(`model   : ${config.piperModel || "(unset)"}`);
console.log(`ffmpeg  : ${config.ffmpegBin}`);
console.log(`bitrate : ${config.ttsBitrate}`);
console.log("---");

if (!config.ttsEnabled) {
  console.log("TTS is off. Set TTS_ENABLED=true in .env to attach audio.");
  process.exit(0);
}

const sample = [
  "Good morning! ☀️ Your *Portugal* brief for today",
  "🎉 NEAREST HOLIDAY\nThis is a _short_ sample used to test the voice.",
];

console.log("Text the voice will read:");
console.log("  " + speakableText(sample, { country: "Portugal" }, "test run").replace(/\n+/g, " / "));
console.log("---");

const audio = await synthesize(sample, { country: "Portugal" }, "test run");

if (!audio) {
  console.error("Audio FAILED — see the [tts] warning above for the reason.");
  process.exit(1);
}

const kb = (fs.statSync(audio.path).size / 1024).toFixed(0);
const dest = `/tmp/${audio.filename}`;
fs.copyFileSync(audio.path, dest);
cleanup(audio.dir);

console.log(`Audio OK — ${kb} KB written to ${dest}`);
console.log("Play it, or copy it off the server to listen:");
console.log(`  scp root@YOUR_VPS_IP:${dest} .`);
process.exit(0);
