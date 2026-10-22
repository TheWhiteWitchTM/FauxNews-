# FAUX NEWS

Satire. A front page that tracks the right-wing wires and files a mocking version next to the headline they actually ran.

FauxGrok is the bot on the desk. About once an hour it reads the public feeds, sends the new headlines to Grok, and commits the jokes. The original headline stays on the card, with a link back to the outlet.

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

The site is static. In the repo: **Settings → Pages → Build and deployment → Deploy from a branch → `main` → `/ (root)` → Save.**

The parody front page then lives at:

https://thewhitewitchtm.github.io/FauxNews-/

## Turn FauxGrok loose

GitHub Actions runs `.github/workflows/fauxgrok.yml` at minute 17 of every hour, and whenever you start it by hand from the Actions tab. Scheduled runs can lag a little. That is GitHub's clock.

Add a repository secret named `XAI_API_KEY` (**Settings → Secrets and variables → Actions**). Until that secret exists, the workflow leaves the desk as it is and warns in the log. With the secret, FauxGrok commits new jokes as `FauxGrok: refresh the desk`.

Each pass mocks at most eight new headlines, skips anything older than 72 hours, and keeps the latest 48. Set `GROK_MODEL`, `FAUX_BATCH`, `FAUX_KEEP`, or `FAUX_MAX_AGE_HOURS` in the workflow if you want a different desk.
