import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { plateFor, PLATE_FILES } from "./plates.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://thewhitewitchtm.github.io/FauxNews-/";
const MODEL = process.env.GROK_MODEL || "grok-4.7";
const BATCH = Number(process.env.FAUX_BATCH || 8);
const KEEP = Number(process.env.FAUX_KEEP || 48);
const MAX_AGE_MS = Number(process.env.FAUX_MAX_AGE_HOURS || 72) * 60 * 60 * 1000;
const USER_AGENT = "FauxGrok/1.0 (+https://github.com/TheWhiteWitchTM/FauxNews-; satire headline tracker)";

const SYSTEM = `You are FauxGrok, desk editor of FAUX NEWS, a satire site that mocks right-wing media framing.
You do not publish news. Readers always see the original headline beside your joke.

For each item write:
- kicker: 1 to 3 words, cable-news energy, no hashtags
- mockHeadline: one line under 140 characters. A joke about the framing. It must not read as a factual report.
- mockDek: one or two sentences under 320 characters. Name the outlet. Mock the spin, the chyron, the panic, or the omission.

Rules:
- Do not invent crimes, medical facts, or private facts about real people.
- Do not state a rumor as if it were true. You may mock a desk for camping on a rumor.
- No slurs, no sexual content, no threats, and no joke that celebrates violence or a victim's harm.
- If the original reports harm, mock the packaging only.
- Keep proper names spelled as given.
- Return only JSON, no markdown: {"stories":[{"url":"...","kicker":"...","mockHeadline":"...","mockDek":"..."}]}
- Copy each url exactly.`;

const BANNED = /\b(nigger|faggot|kike|spic|chink|tranny|retard)\b/i;

function decode(text) {
  return String(text || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, "i"));
  return match ? decode(match[1]) : "";
}

function linkOf(block) {
  const wrapped = block.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
  if (wrapped) {
    const value = decode(wrapped[1]);
    if (/^https?:\/\//i.test(value)) return value;
  }
  const href = block.match(/<link[^>]+href=["']([^"']+)["']/i);
  return href ? decode(href[1]) : "";
}

export function parseFeed(xml) {
  const chunks = String(xml).split(/<(?:item|entry)(?:\s[^>]*)?>/i).slice(1);
  const items = [];
  for (const chunk of chunks) {
    const block = chunk.split(/<\/(?:item|entry)>/i)[0];
    const title = tag(block, "title");
    const link = linkOf(block);
    const publishedAt = tag(block, "pubDate") || tag(block, "published") || tag(block, "updated") || tag(block, "dc:date");
    if (!title || !link) continue;
    items.push({ title, link, publishedAt });
  }
  return items;
}

export function normalizeUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_") || key === "oc") url.searchParams.delete(key);
  }
  url.hash = "";
  return url.toString();
}

export function storyId(url) {
  return createHash("sha1").update(url).digest("hex").slice(0, 12);
}

function stripSuffix(title, source) {
  let next = title;
  for (const suffix of source.titleSuffixes || []) {
    const pattern = new RegExp(`\\s+[\\-\\u2013\\u2014|]\\s+${suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
    next = next.replace(pattern, "");
  }
  return next.trim();
}

function stampOf(value) {
  if (!value) return Date.now();
  const dateOnly = /^(\d{4}-\d{2}-\d{2})$/.exec(value.trim());
  const parsed = new Date(dateOnly ? `${dateOnly[1]}T12:00:00Z` : value);
  const time = parsed.getTime();
  return Number.isNaN(time) ? Date.now() : time;
}

function skipTitle(title) {
  return /^(google news)?$/i.test(title) || /log in|sign in|subscribe to/i.test(title);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
    signal: AbortSignal.timeout(20000),
    redirect: "follow",
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function readWires(source) {
  const groups = [source.feeds || [], source.fallbackFeeds || []];
  for (const [index, feeds] of groups.entries()) {
    const found = [];
    let errors = 0;
    for (const feed of feeds) {
      try {
        const xml = await fetchText(feed);
        found.push(...parseFeed(xml));
      } catch (error) {
        errors += 1;
        console.error(`wire ${source.id} failed: ${error.message}`);
      }
    }
    if (found.length || index === groups.length - 1) {
      if (!found.length && errors) console.error(`wire ${source.id}: no items`);
      return found;
    }
    console.error(`wire ${source.id}: primary empty, trying fallback`);
  }
  return [];
}

function pickFresh(candidates, limit) {
  const buckets = new Map();
  for (const item of candidates) {
    const list = buckets.get(item.sourceId) || [];
    list.push(item);
    buckets.set(item.sourceId, list);
  }
  for (const list of buckets.values()) list.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const picked = [];
  let progressed = true;
  while (picked.length < limit && progressed) {
    progressed = false;
    for (const list of buckets.values()) {
      if (!list.length || picked.length >= limit) continue;
      picked.push(list.shift());
      progressed = true;
    }
  }
  return picked;
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function extractJson(text) {
  const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : String(text);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    const arrayStart = raw.indexOf("[");
    const arrayEnd = raw.lastIndexOf("]");
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      return { stories: JSON.parse(raw.slice(arrayStart, arrayEnd + 1)) };
    }
    throw new Error("model did not return JSON");
  }
  return JSON.parse(raw.slice(start, end + 1));
}

function responseText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  const chunks = [];
  for (const item of payload.output || []) {
    for (const part of item.content || []) {
      if (typeof part.text === "string") chunks.push(part.text);
    }
  }
  if (chunks.length) return chunks.join("\n");
  const chat = payload.choices?.[0]?.message?.content;
  if (typeof chat === "string") return chat;
  throw new Error("model response had no text");
}

async function callGrok(items) {
  const key = process.env.XAI_API_KEY;
  if (!key) {
    const message = "XAI_API_KEY is not set. FauxGrok left the desk unchanged.";
    if (process.env.GITHUB_ACTIONS) console.log(`::warning title=FauxGrok::${message}`);
    console.error(message);
    return null;
  }
  const prompt = `${SYSTEM}\n\nITEMS:\n${JSON.stringify(items.map((item) => ({
    url: item.url,
    outlet: item.source,
    headline: item.originalTitle,
  })))}`;
  const response = await fetch("https://api.x.ai/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, input: prompt }),
    signal: AbortSignal.timeout(90000),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Grok ${response.status}: ${body.slice(0, 400)}`);
  }
  const parsed = extractJson(responseText(JSON.parse(body)));
  const rows = Array.isArray(parsed.stories) ? parsed.stories : [];
  const byUrl = new Map(rows.map((row) => [row.url, row]));
  const accepted = [];
  for (const item of items) {
    const row = byUrl.get(item.url);
    if (!row) {
      console.error(`drop ${item.id}: model skipped it`);
      continue;
    }
    const mockHeadline = String(row.mockHeadline || "").replace(/\s+/g, " ").trim();
    const mockDek = String(row.mockDek || "").replace(/\s+/g, " ").trim();
    const kicker = String(row.kicker || "WIRE").replace(/\s+/g, " ").trim().slice(0, 32);
    const blob = `${kicker} ${mockHeadline} ${mockDek}`;
    if (!mockHeadline || !mockDek || mockHeadline.toLowerCase() === item.originalTitle.toLowerCase()) {
      console.error(`drop ${item.id}: empty or copied headline`);
      continue;
    }
    if (mockHeadline.length > 180 || mockDek.length > 420 || BANNED.test(blob)) {
      console.error(`drop ${item.id}: failed the desk check`);
      continue;
    }
    accepted.push({ ...item, kicker, mockHeadline, mockDek, by: "FauxGrok", model: MODEL });
  }
  if (!accepted.length) throw new Error("Grok returned nothing FauxGrok can print");
  return accepted;
}

export function buildFeed(stories) {
  const items = stories.slice(0, 30).map((story) => `    <item>
      <title>${xmlEscape(story.mockHeadline)}</title>
      <link>${xmlEscape(story.url)}</link>
      <guid isPermaLink="false">${xmlEscape(story.id)}</guid>
      <pubDate>${xmlEscape(new Date(story.publishedAt).toUTCString())}</pubDate>
      <description>${xmlEscape(`${story.kicker}. ${story.mockDek} They wrote: ${story.originalTitle}`)}</description>
      <category>${xmlEscape(story.source)}</category>
    </item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>FAUX NEWS</title>
    <link>${SITE}</link>
    <description>Satire. FauxGrok rewrites right-wing wires. The original headline is always attached.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

async function loadJson(relative, fallback) {
  try {
    return JSON.parse(await readFile(path.join(root, relative), "utf8"));
  } catch (error) {
    if (fallback !== undefined && error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function gather() {
  const sources = await loadJson("data/sources.json");
  const existing = await loadJson("data/stories.json", { stories: [] });
  const seen = new Set((existing.stories || []).map((story) => normalizeUrl(story.url) || story.url));
  const candidates = [];
  const now = Date.now();
  for (const source of sources) {
    const items = await readWires(source);
    let kept = 0;
    for (const item of items) {
      const originalTitle = stripSuffix(item.title, source);
      const url = normalizeUrl(item.link);
      if (!url || !originalTitle || skipTitle(originalTitle) || seen.has(url)) continue;
      const publishedMs = stampOf(item.publishedAt);
      if (now - publishedMs > MAX_AGE_MS) continue;
      const id = storyId(url);
      if (candidates.some((candidate) => candidate.id === id)) continue;
      candidates.push({
        id,
        sourceId: source.id,
        source: source.name,
        originalTitle,
        url,
        publishedAt: new Date(publishedMs).toISOString(),
      });
      seen.add(url);
      kept += 1;
      if (kept >= 6) break;
    }
    console.log(`${source.short.padEnd(5)} ${source.name}: ${items.length} on the wire, ${kept} fresh`);
  }
  return { existing, candidates };
}

function withArt(stories) {
  return stories.map((story) => ({ ...story, image: plateFor(story) }));
}

async function writeDesk(stories, options = {}) {
  const filed = withArt(stories);
  const previous = options.touch === false ? await loadJson("data/stories.json", {}) : null;
  const payload = {
    updatedAt: options.touch === false ? (previous.updatedAt || new Date().toISOString()) : new Date().toISOString(),
    bot: { name: "FauxGrok", model: MODEL, cadence: "hourly" },
    satire: true,
    stories: filed,
  };
  await writeFile(path.join(root, "data/stories.json"), `${JSON.stringify(payload, null, 2)}\n`);
  await writeFile(path.join(root, "feed.xml"), buildFeed(filed));
}

function selfTest() {
  const xml = `<?xml version="1.0"?><rss><channel><title>Example</title><image><title>Example art</title></image>
    <item><title><![CDATA[Hello &amp; friends - Newsmax]]></title><link>https://example.com/a?utm_source=x&amp;ok=1</link><pubDate>Wed, 21 Oct 2026 12:00:00 GMT</pubDate></item>
    <item><title>Log in</title><link>https://example.com/login</link></item>
  </channel></rss>`;
  const parsed = parseFeed(xml);
  if (parsed.length !== 2) throw new Error(`expected 2 items, got ${parsed.length}`);
  if (parsed[0].title !== "Hello & friends - Newsmax") throw new Error(`title decode failed: ${parsed[0].title}`);
  const url = normalizeUrl(parsed[0].link);
  if (url !== "https://example.com/a?ok=1") throw new Error(`url normalize failed: ${url}`);
  const stripped = stripSuffix(parsed[0].title, { titleSuffixes: ["Newsmax"] });
  if (stripped !== "Hello & friends") throw new Error(`suffix strip failed: ${stripped}`);
  const feed = buildFeed([{
    id: "abc",
    mockHeadline: "A & B",
    url: "https://example.com/a",
    publishedAt: "2026-10-22T00:00:00.000Z",
    kicker: "WIRE",
    mockDek: "Dek",
    originalTitle: "They <wrote>",
    source: "Fox News",
  }]);
  if (!feed.includes("A &amp; B") || !feed.includes("They &lt;wrote&gt;")) throw new Error("feed escape failed");
  const debate = plateFor({
    id: "podium",
    kicker: "PODIUM",
    mockHeadline: "Two podiums",
    mockDek: "A debate.",
    originalTitle: "debate",
  });
  if (debate !== "media/plates/debate.jpg") throw new Error(`plate pick failed: ${debate}`);
  const quiet = plateFor({ id: "quiet", kicker: "QUIET", mockHeadline: "Nothing topical", mockDek: "Just a joke.", originalTitle: "Hello" });
  if (!PLATE_FILES.includes(quiet)) throw new Error(`plate fallback failed: ${quiet}`);
  if (plateFor({ id: "quiet", kicker: "QUIET", mockHeadline: "Nothing topical", mockDek: "Just a joke.", originalTitle: "Hello" }) !== quiet) {
    throw new Error("plate pick drifted");
  }
  console.log("self-test ok");
}

async function main() {
  const flags = new Set(process.argv.slice(2));
  if (flags.has("--self-test")) {
    selfTest();
    return;
  }
  if (flags.has("--rebuild-feed")) {
    const existing = await loadJson("data/stories.json");
    await writeDesk(existing.stories || [], { touch: false });
    console.log(`feed rebuilt with ${(existing.stories || []).length} stories`);
    return;
  }
  if (flags.has("--stamp-images")) {
    const existing = await loadJson("data/stories.json");
    await writeDesk(existing.stories || [], { touch: false });
    console.log(`stills stamped on ${(existing.stories || []).length} stories`);
    return;
  }
  const { existing, candidates } = await gather();
  const fresh = pickFresh(candidates, BATCH);
  console.log(`fresh to mock: ${fresh.length}`);
  if (flags.has("--dry-run")) return;
  if (!fresh.length) {
    console.log("nothing new on the wires");
    return;
  }
  const mocked = await callGrok(fresh);
  if (!mocked) return;
  const merged = [...mocked, ...(existing.stories || [])];
  const unique = [];
  const ids = new Set();
  for (const story of merged) {
    if (ids.has(story.id)) continue;
    ids.add(story.id);
    unique.push(story);
  }
  unique.sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
  await writeDesk(unique.slice(0, KEEP));
  console.log(`desk filed: ${Math.min(unique.length, KEEP)} stories, ${mocked.length} new`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
