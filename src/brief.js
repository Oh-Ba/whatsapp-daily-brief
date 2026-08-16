/**
 * brief.js — generates the daily country brief.
 *
 * One call to the Anthropic Messages API with the web_search tool enabled.
 * Claude searches the web for fresh news / upcoming holidays / current
 * prices, then writes the whole brief in a WhatsApp-friendly format.
 *
 * The brief is returned as an ARRAY of message strings — one per section —
 * so WhatsApp receives 6 tidy messages instead of one giant wall of text.
 *
 * API reference: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
 */

import { config } from "./config.js";

const SECTION_DELIMITER = "<<<SPLIT>>>";

function buildPrompt(user) {
  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: config.timezone,
  });

  return `You are "Daily Country Brief", a friendly morning-briefing writer.
Today is ${today}. The reader is ${user.name}. The country of interest is: ${user.country}.

Use web search to find CURRENT information (today's news, the actual nearest holiday, up-to-date prices). Then write a WhatsApp morning brief with EXACTLY these 6 parts, in this order, separated by the literal delimiter line ${SECTION_DELIMITER} (on its own line, nothing else on that line):

PART 1 — GREETING + NEWS 📰
Start with "Good morning ${user.name}! ☀️ Your ${user.country} brief for ${today}".
Then 5-6 one-or-two-line news items from ${user.country}, covering: politics, economics, technology, culture, crime, and one "interesting/quirky" story. Prefix each with a fitting emoji. Keep each item short and concrete.

PART 2 — NEAREST HOLIDAY 🎉
Find the holiday closest to today in ${user.country} (it may be a few days in the past or the future — pick whichever is nearest, and say how many days away it is). Explain: what it is about, its main ceremonies/traditions, and — if it is a Christian holiday — what is UNIQUE about how ${user.country} specifically celebrates it compared to other countries.

PART 3 — LANGUAGE CORNER 🗣️
A short, simple dialogue in the main language of ${user.country}, for everyday/tourist life. Rotate the scenario day by day among: meeting a friend, ordering food in a restaurant, ordering coffee on the way to work, grocery shopping, ordering a taxi, asking for directions, and general small talk. Pick ONE scenario for today.
Format each line as:
- Original language
- (transliteration in Latin letters, if the script is not Latin)
- English translation
Keep it to 6-8 exchanges, beginner level. End with 2-3 useful bonus words.

PART 4 — GEOGRAPHY 🗺️
3-5 sentences about the geography of ${user.country}: location, terrain, climate, notable natural features, and one surprising geographic fact.

PART 5 — PRICES IN THE CAPITAL 💰
Current average prices in the capital of ${user.country}, in local currency AND approximate USD:
- ☕ Cappuccino in a cafe
- 🍽️ Meal for two, mid-range restaurant
- 🏠 Monthly rent, 1-bedroom apartment in the city center
- 🚗 New economy car (e.g. VW Golf class or local equivalent)

PART 6 — SIGN-OFF
One short, warm closing line + remind: "Reply STATUS to get this brief again, or COUNTRY <name> to switch country."

STYLE RULES (important):
- WhatsApp formatting only: *bold* with single asterisks, _italics_ with underscores. NO markdown headers (#), NO markdown links, NO tables.
- Each PART must be under 1000 characters (WhatsApp splits long messages badly).
- Plain, warm, concise language. Emojis welcome but not excessive.
- Do NOT include citations, URLs, or source names in the text.
- Output ONLY the brief itself: no preamble, no explanation of what you did.`;
}

/**
 * Call the Anthropic Messages API (with web search) and return
 * an array of WhatsApp-ready message strings.
 */
export async function generateBrief(user) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: 4000,
      messages: [{ role: "user", content: buildPrompt(user) }],
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 8,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = await res.json();

  // The response interleaves text blocks with server_tool_use /
  // web_search_tool_result blocks. Keep only the text.
  const fullText = (data.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  if (!fullText) throw new Error("Empty response from Anthropic API");

  // Split into the 6 parts, then hard-wrap anything still too long
  // (Twilio WhatsApp body limit is 1600 chars).
  const parts = fullText
    .split(SECTION_DELIMITER)
    .map((p) => p.trim())
    .filter(Boolean);

  const messages = [];
  for (const part of parts) {
    if (part.length <= 1500) {
      messages.push(part);
    } else {
      // Split on paragraph boundaries into <=1500-char chunks
      let chunk = "";
      for (const para of part.split("\n\n")) {
        if ((chunk + "\n\n" + para).length > 1500 && chunk) {
          messages.push(chunk.trim());
          chunk = para;
        } else {
          chunk = chunk ? chunk + "\n\n" + para : para;
        }
      }
      if (chunk.trim()) messages.push(chunk.trim());
    }
  }

  return messages;
}
