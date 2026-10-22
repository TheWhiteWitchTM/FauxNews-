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
    color: "#c20017",
    site: "#",
  };
}

function when(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const hours = Math.round((Date.now() - date.getTime()) / 3600000);
  if (hours < 1) return "Just in";
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
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

function linkTo(story, className) {
  const href = safeUrl(story.url);
  const link = el("a", className);
  if (!href) return link;
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function originalLink(story, label) {
  const link = linkTo(story, "original-link");
  link.textContent = label;
  return link;
}

function safeImage(value) {
  return typeof value === "string" && /^media\/(?:plates|stories)\/[a-z0-9-]+\.jpg$/.test(value);
}

function onArticlePage() {
  return document.body.dataset.page === "article";
}

function storyHref(story) {
  return `article.html?id=${encodeURIComponent(story.id)}`;
}

function storyLink(story, className) {
  const link = el("a", className);
  link.href = storyHref(story);
  return link;
}

function packOf(story) {
  const id = String(story.id || story.mockHeadline || "");
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n + id.charCodeAt(i) * (i + 1)) % 6;
  return `pack-${n}`;
}

function focusOf(story) {
  const id = String(story.id || "");
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n + id.charCodeAt(i) * (i + 1)) % 100;
  return `${30 + (n % 41)}% ${18 + ((n * 5) % 55)}%`;
}

function media(story, hero) {
  const source = sourceOf(story.sourceId);
  const node = el("div", "m");
  if (safeImage(story.image)) {
    node.classList.add("has-photo");
    const img = document.createElement("img");
    img.className = "still-photo";
    img.alt = story.kicker ? `Parody still, ${story.kicker}` : "Parody still";
    img.src = story.image;
    img.style.objectPosition = story.image.startsWith("media/stories/") ? "center" : focusOf(story);
    if (!hero) img.loading = "lazy";
    node.append(img);
  } else {
    const still = el("div", `still ${hero ? "pack-hero" : packOf(story)}`);
    still.setAttribute("aria-hidden", "true");
    still.append(el("p", "still-kicker", story.kicker || "Wire"));
    node.append(still);
  }
  node.append(el("span", "still-bug", "FAUX"));
  node.append(el("span", "still-source", source.short));
  const kick = el("span", "kicker");
  kick.append(el("span", "kicker-text", story.kicker || "Wire"));
  node.append(kick);
  node.append(el("span", "play"));
  return node;
}

function linkedMedia(story, hero) {
  const link = storyLink(story, "media-link");
  link.setAttribute("aria-label", story.mockHeadline);
  link.append(media(story, hero));
  return link;
}

function headlineLink(story, className = "hed") {
  const link = storyLink(story, className);
  link.textContent = story.mockHeadline;
  return link;
}

function metaLine(story) {
  const meta = el("div", "meta");
  const time = el("time", null, when(story.publishedAt));
  time.dateTime = story.publishedAt || "";
  time.title = story.publishedAt || "";
  meta.append(time);
  meta.append(el("span", null, story.source));
  if (safeImage(story.image)) meta.append(el("span", "art-credit", "Parody"));
  meta.append(originalLink(story, "Read their story"));
  return meta;
}

function renderHero(story, related) {
  const hero = $("hero");
  hero.replaceChildren();
  if (!story) {
    const desk = state.desk === "all" ? "the wires" : sourceOf(state.desk).name;
    const why = state.query
      ? `Nothing on ${desk} matches “${state.query}”.`
      : `Nothing new on ${desk}. FauxGrok checks again within the hour.`;
    hero.append(el("p", "empty", why));
    return;
  }
  const article = el("article", "article story-1");
  article.append(linkedMedia(story, true));
  const info = el("div", "info");
  const title = el("h2");
  title.append(headlineLink(story));
  info.append(title);
  info.append(el("p", "dek", story.mockDek));
  const wrote = el("p", "original");
  wrote.append(el("span", null, "They wrote"));
  wrote.append(document.createTextNode(story.originalTitle));
  info.append(wrote);
  info.append(metaLine(story));
  article.append(info);
  if (related.length) {
    const list = el("ul", "related");
    for (const item of related) {
      const li = el("li");
      li.append(headlineLink(item, ""));
      list.append(li);
    }
    article.append(list);
  }
  hero.append(article);
}

function renderThumbs(stories) {
  const row = $("thumbs");
  row.replaceChildren();
  row.hidden = stories.length === 0;
  for (const story of stories) {
    const card = el("article", "thumb");
    card.append(linkedMedia(story));
    const title = el("h3");
    title.append(headlineLink(story));
    card.append(title);
    const meta = el("div", "meta");
    meta.append(el("span", null, `${sourceOf(story.sourceId).name} · ${when(story.publishedAt)}`));
    if (safeImage(story.image)) meta.append(el("span", "art-credit", "Parody"));
    card.append(meta);
    row.append(card);
  }
}

function renderOpinion(stories) {
  const row = $("opinion");
  const band = $("opinion-band");
  row.replaceChildren();
  band.hidden = stories.length === 0;
  for (const story of stories) {
    const card = el("article", "op-card");
    card.append(linkedMedia(story));
    const title = el("h3");
    title.append(headlineLink(story));
    card.append(title);
    const by = el("p", "op-by");
    const face = document.createElement("img");
    face.className = "avatar";
    face.src = "media/plates/anchor.jpg";
    face.alt = "";
    by.append(face);
    by.append(document.createTextNode("FauxGrok"));
    card.append(by);
    card.append(el("p", "op-dek", story.mockDek));
    card.append(originalLink(story, "Their story"));
    row.append(card);
  }
}

function renderCard(story) {
  const card = el("article", "card");
  card.append(linkedMedia(story));
  const title = el("h3");
  title.append(headlineLink(story));
  card.append(title);
  const wrote = el("p", "card-wrote");
  wrote.append(el("span", null, "They wrote"));
  wrote.append(document.createTextNode(story.originalTitle));
  card.append(wrote);
  const meta = el("div", "meta");
  meta.append(el("span", null, `${story.source} · ${when(story.publishedAt)}`));
  if (safeImage(story.image)) meta.append(el("span", "art-credit", "Parody"));
  card.append(meta);
  card.append(originalLink(story, "Read their story"));
  return card;
}

function renderLatest(stories) {
  const list = $("latest");
  list.replaceChildren();
  if (!stories.length) {
    list.append(el("li", "empty", "No headlines on this wire."));
    return;
  }
  for (const story of stories) {
    const item = el("li");
    const link = storyLink(story, "latest-link");
    link.append(media(story));
    const copy = el("span");
    copy.append(el("span", "latest-hed", story.mockHeadline));
    copy.append(el("span", "latest-meta", `${story.source} · ${when(story.publishedAt)}`));
    link.append(copy);
    item.append(link);
    list.append(item);
  }
}

function renderChips() {
  const nav = $("chips");
  nav.replaceChildren();
  const desks = [
    { id: "all", short: "All", name: "All wires", color: "#003366" },
    ...state.sources.map((source) => ({
      id: source.id,
      short: source.short,
      name: source.name,
      color: source.color,
    })),
  ];
  for (const desk of desks) {
    const button = el("button", "chip", desk.short);
    button.type = "button";
    button.dataset.desk = desk.id;
    if (desk.color) button.style.setProperty("--chip", desk.color);
    button.title = desk.name;
    button.setAttribute("aria-pressed", String(state.desk === desk.id));
    button.addEventListener("click", () => {
      if (onArticlePage()) {
        location.href = desk.id === "all" ? "./" : `./?desk=${encodeURIComponent(desk.id)}`;
        return;
      }
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
    item.append(el("span", "count", count ? String(count) : "—"));
    list.append(item);
  }
}

function renderBreaking(story) {
  const bar = $("breaking");
  if (!bar) return;
  bar.replaceChildren();
  if (!story) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  bar.append(el("span", "breaking-tag", "Breaking News"));
  const link = storyLink(story, "breaking-link");
  link.textContent = `${story.kicker} — ${story.mockHeadline}`;
  bar.append(link);
}

function renderArticle() {
  const main = $("story");
  const id = new URLSearchParams(location.search).get("id");
  const story = state.stories.find((item) => item.id === id);
  renderBreaking(state.stories[0]);
  main.replaceChildren();
  if (!story) {
    document.title = "Story not on the desk — FAUX NEWS";
    main.append(el("p", "empty", "That story is not on the desk."));
    const back = el("a", "original-link", "Back to the front page");
    back.href = "./";
    main.append(back);
    renderLatest(state.stories.slice(0, 8));
    return;
  }
  document.title = `${story.mockHeadline} — FAUX NEWS`;
  const source = sourceOf(story.sourceId);
  const crumb = el("p", "article-crumb");
  const home = el("a", null, "Home");
  home.href = "./";
  crumb.append(home, document.createTextNode(" / "), el("span", null, source.name));
  main.append(crumb);
  main.append(el("p", "article-kicker", story.kicker || "Wire"));
  main.append(el("h1", "article-title", story.mockHeadline));
  const by = el("p", "article-by");
  const time = el("time", null, when(story.publishedAt));
  time.dateTime = story.publishedAt || "";
  by.append(el("span", "article-author", "FauxGrok"));
  by.append(time);
  by.append(el("span", null, story.source));
  main.append(by);
  main.append(el("p", "article-dek", story.mockDek));
  if (safeImage(story.image)) {
    const figure = el("figure", "article-figure");
    const img = document.createElement("img");
    img.src = story.image;
    img.alt = story.kicker ? `Parody still, ${story.kicker}` : "Parody still";
    figure.append(img);
    figure.append(el("figcaption", null, "Parody still. Not a photograph from the outlet."));
    main.append(figure);
  }
  const wrote = el("p", "original article-original");
  wrote.append(el("span", null, "They wrote"));
  wrote.append(document.createTextNode(story.originalTitle));
  main.append(wrote);
  const out = originalLink(story, "Read their story");
  out.classList.add("article-out");
  main.append(out);
  const sameWire = state.stories.filter((item) => item.id !== story.id && item.sourceId === story.sourceId);
  const more = (sameWire.length ? sameWire : state.stories.filter((item) => item.id !== story.id)).slice(0, 4);
  if (more.length) {
    const block = el("section", "article-more");
    block.append(el("h2", null, "More from the desk"));
    const list = el("ul", "article-related");
    for (const item of more) {
      const li = el("li");
      const row = storyLink(item, "more-row");
      if (safeImage(item.image)) {
        const thumb = document.createElement("img");
        thumb.src = item.image;
        thumb.alt = "";
        thumb.loading = "lazy";
        row.append(thumb);
      }
      row.append(el("span", null, item.mockHeadline));
      li.append(row);
      list.append(li);
    }
    block.append(list);
    main.append(block);
  }
  renderLatest(state.stories.filter((item) => item.id !== story.id).slice(0, 8));
}

function render() {
  const stories = visibleStories();
  const label = state.desk === "all" ? "the wires" : sourceOf(state.desk).name;
  $("wires-title").textContent = state.desk === "all" ? "Latest News" : sourceOf(state.desk).name;
  $("status").textContent = stories.length
    ? `${stories.length} headline${stories.length === 1 ? "" : "s"}`
    : `No headlines on ${label}${state.query ? " match that search" : ""}.`;
  const opinion = stories.slice(10, 14);
  const rest = stories.slice(14);
  $("wires").hidden = rest.length === 0 && stories.length > 0;
  renderBreaking(stories[0]);
  renderHero(stories[0], stories.slice(1, 4));
  renderThumbs(stories.slice(4, 10));
  renderOpinion(opinion);
  $("cards").replaceChildren(...rest.map(renderCard));
  renderLatest(stories.slice(1, 9));
  markChips();
}

function paintClock() {
  const nodes = document.querySelectorAll(".js-clock");
  if (!nodes.length) return;
  const time = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
  const label = time.replace(/\s*(AM|PM)$/i, (_, ampm) => " " + ampm.toUpperCase());
  for (const node of nodes) node.textContent = label;
}

function bindMenu() {
  const menuToggle = document.querySelector(".menu-toggle");
  const sectionMenu = $("section-menu");
  if (!menuToggle || !sectionMenu) return;
  const label = menuToggle.querySelector(".menu-toggle-label");
  const setOpen = (open) => {
    sectionMenu.classList.toggle("is-open", open);
    menuToggle.setAttribute("aria-expanded", String(open));
    if (label) label.textContent = open ? "Close" : "Menu";
  };
  menuToggle.addEventListener("click", () => {
    setOpen(!sectionMenu.classList.contains("is-open"));
  });
  sectionMenu.addEventListener("click", (event) => {
    if (event.target.closest("a")) setOpen(false);
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 1100) setOpen(false);
  });
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
  if (!sourceRes.ok || !storyRes.ok) throw new Error("The desk copy did not load.");
  state.sources = await sourceRes.json();
  const desk = await storyRes.json();
  state.stories = (desk.stories || []).slice().sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)));
  state.bot = desk.bot;
  state.updatedAt = desk.updatedAt;
  if (desk.bot?.model) $("model-name").textContent = desk.bot.model;
  const updated = desk.updatedAt ? new Date(desk.updatedAt) : null;
  $("edition-meta").textContent = updated && !Number.isNaN(updated.getTime())
    ? updated.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " ET"
    : "Desk copy loaded";
  renderSources();
  renderChips();
  if (onArticlePage()) renderArticle();
  else render();
}

$("q").addEventListener("input", (event) => {
  if (onArticlePage()) return;
  state.query = event.target.value;
  const url = new URL(location.href);
  if (state.query) url.searchParams.set("q", state.query);
  else url.searchParams.delete("q");
  history.replaceState(null, "", url);
  render();
});

$("q").addEventListener("keydown", (event) => {
  if (!onArticlePage() || event.key !== "Enter") return;
  const query = event.target.value.trim();
  location.href = query ? `./?q=${encodeURIComponent(query)}` : "./";
});

paintClock();
setInterval(paintClock, 30000);
bindMenu();

load().catch((error) => {
  const status = $("status");
  if (status) status.textContent = "The desk copy did not load.";
  const slot = $("hero") || $("story");
  if (slot) slot.replaceChildren(el("p", "empty", error.message));
});
