const state = {
  sources: [],
  stories: [],
  bot: null,
  updatedAt: null,
  desk: "all",
  query: "",
};

const $ = (id) => document.getElementById(id);

function safeUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.href;
  } catch {
    return null;
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function sourceOf(id) {
  return state.sources.find((source) => source.id === id) || {
    id,
    name: id,
    short: id.slice(0, 3).toUpperCase(),
    color: "#14110e",
    site: "#",
  };
}

function when(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const hours = Math.round((Date.now() - date.getTime()) / 3600000);
  if (hours < 1) return "just in";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 21) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function visibleStories() {
  const query = state.query.trim().toLowerCase();
  return state.stories.filter((story) => {
    if (state.desk !== "all" && story.sourceId !== state.desk) return false;
    if (!query) return true;
    const hay = `${story.mockHeadline} ${story.mockDek} ${story.originalTitle} ${story.source} ${story.kicker}`.toLowerCase();
    return hay.includes(query);
  });
}

function badge(story) {
  const source = sourceOf(story.sourceId);
  const node = el("span", "badge", source.short);
  node.style.background = source.color;
  node.title = source.name;
  return node;
}

function originalLink(story, label) {
  const href = safeUrl(story.url);
  const link = el("a", "original-link", label);
  if (!href) {
    link.removeAttribute("href");
    return link;
  }
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function renderHero(story) {
  const hero = $("hero");
  hero.replaceChildren();
  if (!story) {
    hero.append(el("p", "empty", "This desk is quiet. FauxGrok checks the wires again within the hour."));
    return;
  }
  hero.append(el("p", "kicker", story.kicker || "WIRE"));
  hero.append(el("h2", null, story.mockHeadline));
  hero.append(el("p", "dek", story.mockDek));
  const said = el("div", "said");
  said.append(el("span", null, "They wrote"));
  said.append(el("p", null, story.originalTitle));
  hero.append(said);
  const meta = el("div", "meta");
  meta.append(badge(story));
  const time = el("time", null, when(story.publishedAt));
  time.dateTime = story.publishedAt || "";
  time.title = story.publishedAt || "";
  meta.append(time);
  meta.append(el("span", null, story.source));
  meta.append(originalLink(story, "Open the real story"));
  hero.append(meta);
}

function renderCard(story) {
  const card = el("article", "card");
  const top = el("div", "card-top");
  top.append(badge(story));
  const time = el("time", null, when(story.publishedAt));
  time.dateTime = story.publishedAt || "";
  top.append(time);
  card.append(top);
  card.append(el("p", "kicker", story.kicker || "WIRE"));
  card.append(el("h3", null, story.mockHeadline));
  card.append(el("p", "original", story.originalTitle));
  card.append(el("p", "dek", story.mockDek));
  card.append(originalLink(story, "Their story"));
  return card;
}

function renderTicker(stories) {
  const track = $("ticker");
  const group = el("div", "ticker-group");
  const lines = (stories.length ? stories : state.stories).slice(0, 12);
  for (const story of lines) {
    group.append(el("span", null, `${sourceOf(story.sourceId).short}  ${story.mockHeadline}`));
  }
  if (!lines.length) group.append(el("span", null, "FauxGrok is waiting on the wires"));
  const clone = group.cloneNode(true);
  track.replaceChildren(group, clone);
}

function renderChips() {
  const nav = $("chips");
  nav.replaceChildren();
  const desks = [{ id: "all", short: "All desks" }, ...state.sources.map((source) => ({ id: source.id, short: source.short }))];
  for (const desk of desks) {
    const button = el("button", "chip", desk.short);
    button.type = "button";
    button.dataset.desk = desk.id;
    button.setAttribute("aria-pressed", String(state.desk === desk.id));
    button.addEventListener("click", () => {
      state.desk = desk.id;
      const url = new URL(location.href);
      if (desk.id === "all") url.searchParams.delete("desk");
      else url.searchParams.set("desk", desk.id);
      history.replaceState(null, "", url);
      render();
    });
    nav.append(button);
  }
}

function markChips() {
  for (const button of $("chips").querySelectorAll(".chip")) {
    button.setAttribute("aria-pressed", String(button.dataset.desk === state.desk));
  }
}

function renderSources() {
  const list = $("sources");
  list.replaceChildren();
  for (const source of state.sources) {
    const count = state.stories.filter((story) => story.sourceId === source.id).length;
    const item = el("li");
    const link = el("a", null, source.name);
    const href = safeUrl(source.site);
    if (href) {
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    }
    item.append(link);
    item.append(el("span", "count", count ? String(count) : "quiet"));
    list.append(item);
  }
}

function render() {
  const stories = visibleStories();
  const label = state.desk === "all" ? "all desks" : sourceOf(state.desk).name;
  $("status").textContent = stories.length
    ? `${stories.length} on ${label}`
    : `Nothing filed for ${label}${state.query ? " matching that slug" : ""}.`;
  renderHero(stories[0]);
  const cards = $("cards");
  cards.replaceChildren(...stories.slice(1).map(renderCard));
  renderTicker(stories);
  markChips();
}

async function load() {
  const params = new URLSearchParams(location.search);
  state.desk = params.get("desk") || "all";
  state.query = params.get("q") || "";
  $("q").value = state.query;
  const [sourceRes, storyRes] = await Promise.all([
    fetch("data/sources.json"),
    fetch("data/stories.json"),
  ]);
  if (!sourceRes.ok || !storyRes.ok) throw new Error("desk copy missing");
  state.sources = await sourceRes.json();
  const desk = await storyRes.json();
  state.stories = (desk.stories || []).slice().sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
  state.bot = desk.bot;
  state.updatedAt = desk.updatedAt;
  if (desk.bot?.model) $("model-name").textContent = desk.bot.model;
  const updated = desk.updatedAt ? new Date(desk.updatedAt) : null;
  $("edition-meta").textContent = updated && !Number.isNaN(updated.getTime())
    ? `Filed ${updated.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
    : "Desk copy loaded";
  renderSources();
  renderChips();
  render();
}

$("q").addEventListener("input", (event) => {
  state.query = event.target.value;
  const url = new URL(location.href);
  if (state.query) url.searchParams.set("q", state.query);
  else url.searchParams.delete("q");
  history.replaceState(null, "", url);
  render();
});

load().catch((error) => {
  $("status").textContent = "The desk copy did not load.";
  $("hero").append(el("p", "empty", error.message));
});
