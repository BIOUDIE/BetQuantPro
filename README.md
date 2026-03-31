# Betting Quant Pro (BQP)

A quantitative sports betting dashboard — strategy backtester, value bet finder, and fluke detector.

---

## Quick Start (3 steps)

### Step 1 — Install Node.js
1. Go to https://nodejs.org
2. Click the big green **"LTS"** button to download
3. Run the installer — click Next on everything, keep all defaults
4. When done, open **Terminal** (Mac) or **Command Prompt** (Windows)
   - Windows: press `Win + R`, type `cmd`, press Enter
   - Mac: press `Cmd + Space`, type `Terminal`, press Enter
5. Type this and press Enter to confirm Node installed:
   ```
   node --version
   ```
   You should see something like `v20.x.x`

---

### Step 2 — Set Up the Project
1. Put the `betting-quant-pro` folder somewhere easy (e.g. your Desktop)
2. In your Terminal / Command Prompt, navigate to it:
   ```
   cd Desktop/betting-quant-pro
   ```
3. Install all dependencies (only needed once):
   ```
   npm install
   ```
   This will download packages — takes 1–2 minutes.

---

### Step 3 — Run the App
```
npm run dev
```
Open your browser and go to: **http://localhost:5173**

That's it — the dashboard is live!

---

## Using the Dashboard

### Dashboard Tab
- **Strategy Input** — Type or pick a template strategy. Press **RUN BACKTEST** to simulate it.
- **Performance Graph** — See your bankroll curve vs a passive baseline. Toggle to EV/Bet view.
- **Value Bets Ledger** — Sortable table of all qualifying bets. Click column headers to sort.
- **Fluke Detector** — Teams ranked by overvaluation score. FADE = avoid backing them.

### Data Tab
- Upload your own **CSV or JSON** match data file
- Click **DOWNLOAD SAMPLE CSV TEMPLATE** to get a correctly-formatted example
- Once loaded, run the backtester against your real data

---

## Strategy String Syntax

```
field operator value AND field operator value AT min = 60
```

**Examples:**
```
home_possession > 60 AND score = "0-0" AT min = 60
xg_diff > 0.8 AND home_pressure_index > 0.65
away_luck_score < -0.5 AND odds_home_win > 2.1
volatility_score > 0.7 AND yellow_cards < 2 AT min = 45
```

**Supported operators:** `>` `<` `>=` `<=` `=`

---

## CSV Column Reference

| Column | Required | Description |
|--------|----------|-------------|
| home_team | ✅ | Home team name |
| away_team | ✅ | Away team name |
| home_goals | ✅ | Full-time home goals |
| away_goals | ✅ | Full-time away goals |
| home_xg | ⭐ | Home expected goals |
| away_xg | ⭐ | Away expected goals |
| home_possession | ⭐ | Home possession % (0–100) |
| away_possession | ⭐ | Away possession % |
| home_shots_on_target | ○ | Home shots on target |
| away_shots_on_target | ○ | Away shots on target |
| home_corners | ○ | Home corners |
| away_corners | ○ | Away corners |
| home_yellow_cards | ○ | Home yellow cards |
| away_yellow_cards | ○ | Away yellow cards |
| home_red_cards | ○ | Home red cards |
| away_red_cards | ○ | Away red cards |
| home_fouls | ○ | Home fouls |
| away_fouls | ○ | Away fouls |
| odds_home_win | ○ | Decimal odds for home win |
| odds_draw | ○ | Decimal odds for draw |
| odds_away_win | ○ | Decimal odds for away win |
| calc | ○ | Your calculated probability |
| impl | ○ | Bookmaker implied probability |
| gap | ○ | Value gap (calc − impl) |
| ev | ○ | Expected value |
| kelly | ○ | Kelly fraction |
| odds | ○ | Market odds used |
| result | ○ | WIN or LOSS |

✅ Required  ⭐ Strongly recommended  ○ Optional

---

## The Maths

### Expected Value
```
EV = (p_calc × odds) − 1
```

### Kelly Criterion
```
f* = (p × (odds−1) − (1−p)) / (odds−1)
```
BQP uses half-Kelly (f* × 0.5) by default.

### Fluke Score
```
FlukeScore = 0.4×Luck + 0.25×(1−PressureIndex) + 0.25×xGRatio + 0.10×VolatilityScore
```
Score > 0.7 → FADE (team overvalued by market)
Score < 0.3 → BACK (team undervalued)

---

## Stopping the App
In Terminal, press `Ctrl + C` to stop the server.

To restart later, just run `npm run dev` again from the project folder.
