# FAUX NEWS

Satire. A front page that tracks the right-wing wires and files a mocking version next to the headline they actually ran.

FauxGrok is the bot on the desk. At noon and at 8pm US Eastern it reads the public feeds, sends the new headlines to Grok, and commits the jokes. Each new post keeps a still. The original headline stays on the card, with a link back to the outlet.

FAUX NEWS is an independent parody. Fox News, Breitbart, Real America's Voice, Newsmax, One America News, and the other newsrooms named on the page are the outlets being mocked. None of them run this desk.

## What it tracks

Fox News, Breitbart, Real America's Voice, Just the News (the wire RAV points viewers to), Newsmax, One America News, The Daily Wire, The Blaze, The Federalist, the Washington Examiner, The Gateway Pundit, the Washington Times, the New York Post, Townhall, National Review, and PJ Media.

OANN's own feed refuses bot fetches, and Newsmax's feed is flaky, so those desks fall back to the public Google News wire for the same sites. FauxGrok stores the headline, the link, and the joke. It does not republish the articles.

## Run it locally

```bash
npm run self-test
npm run dry-run
XAI_API_KEY=your_key npm run update
python3 -m http.server 8765
```

Open `http://127.0.0.1:8765`. A key comes from the [xAI console](https://console.x.ai/team/default/api-keys). The updater calls `grok-4.7` at `https://api.x.ai/v1`.

## Put it on GitHub Pages

The site is static. `.github/workflows/pages.yml` publishes `main` on every push.

The parody front page lives at:

https://thewhitewitchtm.github.io/FauxNews-/

## Turn FauxGrok loose

The clock is on this machine, at noon and 8pm US Eastern. The script is `scripts/fauxgrok.sh`. Cron starts it. The same command is the Run button on the Grok bots desk, under FauxNews.

A pass calls the model once, and only when the wires have a headline the desk does not already have. It writes `data/stories.json` and `feed.xml`, stamps a still on each new post, commits those files, and pushes them. It leaves the pages alone. A quiet wire spends nothing.

The log is `~/.local/share/fauxnews/fauxgrok.log`. The Grok bots page shows the last line of that pass.

GitHub Actions still has `.github/workflows/fauxgrok.yml` for a manual run from the Actions tab. It is not on a clock. A manual run needs a repository secret named `XAI_API_KEY` (**Settings → Secrets and variables → Actions**). Until that secret exists, the workflow leaves the desk as it is.

Each pass mocks at most eight new headlines, skips anything older than 72 hours, and keeps the latest 48. Set `GROK_MODEL`, `FAUX_BATCH`, `FAUX_KEEP`, or `FAUX_MAX_AGE_HOURS` if you want a different desk.
