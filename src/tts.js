/**
 * tts.js — renders the brief as spoken audio for the email attachment.
 *
 * Uses Piper (https://github.com/rhasspy/piper): a neural TTS that runs
 * locally. Chosen deliberately over a cloud API — no account, no API key,
 * no billing, no per-use cost, and nothing leaves the VPS.
 *
 * Audio is best-effort. If Piper or ffmpeg is missing or fails, the brief
 * still goes out — just without the attachment. Never let the voice break
 * the mail.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.js";

/**
 * Turn the brief into something worth listening to.
 * Emoji, asterisks and bullet dashes all get read aloud literally
 * ("smiling face with sunglasses", "asterisk") unless removed.
 */
export function speakableText(parts, user, dateLabel) {
  const body = parts
    .join("\n\n")
    // Emoji and pictographs
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, "")
    // *bold* and _italics_ markers
    .replace(/[*_]/g, "")
    // Leading list dashes
    .replace(/^[ \t]*[-–—•]\s*/gm, "")
    // The visual section rule used in the plain-text mail
    .replace(/─+/g, "")
    // Collapse the whitespace all that leaves behind
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return `The oh eight hundred brief. ${user.country}. ${dateLabel}.\n\n${body}`;
}

function run(cmd, args, { input } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";

    child.stderr.on("data", (d) => {
      // Keep only the tail — ffmpeg is extremely chatty on success.
      stderr = (stderr + d.toString()).slice(-2000);
    });

    child.on("error", (err) =>
      reject(new Error(`${cmd} could not start: ${err.message}`))
    );

    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(`${cmd} exited ${code}: ${stderr.trim().slice(-300)}`));
    });

    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

/**
 * Synthesize the brief to MP3.
 * Returns { path, filename } on success, or null if audio is disabled
 * or anything goes wrong.
 */
export async function synthesize(parts, user, dateLabel) {
  if (!config.ttsEnabled) return null;

  if (!config.piperModel || !fs.existsSync(config.piperModel)) {
    console.warn(`[tts] PIPER_MODEL not found at ${config.piperModel || "(unset)"} — skipping audio`);
    return null;
  }

  const stamp = crypto.randomBytes(4).toString("hex");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `brief-${stamp}-`));
  const wav = path.join(dir, "brief.wav");
  const mp3 = path.join(dir, "brief.mp3");

  try {
    const text = speakableText(parts, user, dateLabel);
    console.log(`[tts] Synthesizing ${text.length} characters...`);

    await run(config.piperBin, ["--model", config.piperModel, "--output_file", wav], {
      input: text,
    });

    // WAV is ~10 MB/minute; mono MP3 at 64k is ~0.5 MB/minute, which keeps
    // a 15-minute brief comfortably under Gmail's 25 MB attachment limit.
    await run(config.ffmpegBin, [
      "-y", "-loglevel", "error",
      "-i", wav,
      "-codec:a", "libmp3lame",
      "-b:a", config.ttsBitrate,
      "-ac", "1",
      mp3,
    ]);

    const bytes = fs.statSync(mp3).size;
    console.log(`[tts] Audio ready (${(bytes / 1048576).toFixed(1)} MB)`);

    return {
      path: mp3,
      dir,
      filename: `brief-${user.country.toLowerCase().replace(/\s+/g, "-")}.mp3`,
    };
  } catch (err) {
    console.warn(`[tts] Audio skipped — ${err.message}`);
    cleanup(dir);
    return null;
  }
}

/** Remove the temp directory once the mail is away. */
export function cleanup(dir) {
  if (!dir) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* a leftover temp dir is not worth failing the run over */
  }
}
