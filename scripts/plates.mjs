const PLATES = [
  { id: "debate", file: "media/plates/debate.jpg", keys: ["debate", "podium", "showdown", "presses", "loyalty", "rival"] },
  { id: "rally", file: "media/plates/rally.jpg", keys: ["rally", "heckler", "crowd", "burn", "arena", "stage"] },
  { id: "desk", file: "media/plates/desk.jpg", keys: ["roundtable", "anchor", "recap", "homepage", "studio", "monologue"] },
  { id: "court", file: "media/plates/court.jpg", keys: ["court", "raid", "apartment", "subpoena", "lawsuit", "fraud", "voter", "ballot"] },
  { id: "capitol", file: "media/plates/capitol.jpg", keys: ["senate", "congress", "capitol", "kansas", "house", "midterm", "needle", "committee"] },
  { id: "mic", file: "media/plates/mic.jpg", keys: ["interview", "says", "said", "speaks", "video", "clip", "comic", "laugh", "exclusive"] },
  { id: "wall", file: "media/plates/wall.jpg", keys: ["poll", "scoreboard", "million", "dollar", "map", "numbers"] },
  { id: "flag", file: "media/plates/flag.jpg", keys: ["america", "patriot", "flag"] },
  { id: "gavel", file: "media/plates/gavel.jpg", keys: ["judge", "gavel", "verdict", "seiz", "illegal", "indict"] },
  { id: "city", file: "media/plates/city.jpg", keys: ["france", "riot", "paris", "street", "city", "nfl", "aboard", "ship"] },
];

function hashOf(id) {
  let n = 0;
  const key = String(id || "desk");
  for (let i = 0; i < key.length; i++) n = (n + key.charCodeAt(i) * (i + 3)) % 997;
  return n;
}

export function plateFor(story) {
  const blob = `${story.kicker || ""} ${story.mockHeadline || ""} ${story.mockDek || ""} ${story.originalTitle || ""}`.toLowerCase();
  const scored = PLATES.map((plate) => ({
    plate,
    score: plate.keys.reduce((n, key) => n + (blob.includes(key) ? 1 : 0), 0),
  }));
  const best = Math.max(...scored.map((row) => row.score));
  const pool = (best > 0 ? scored.filter((row) => row.score === best) : scored).map((row) => row.plate);
  return pool[hashOf(story.id) % pool.length].file;
}

export const PLATE_FILES = PLATES.map((plate) => plate.file);
