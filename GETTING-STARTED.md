# Getting Started — from absolute zero

This guide assumes you have **never used a terminal or installed a programming tool**. Every step tells you what to do, what success looks like, and how to fix the most common problem.

**Shortcut:** if you only want to *play* the game, you don't need any of this — just open
**https://austinschuetz.github.io/critting-ducks/** in your browser.

**Other shortcut:** if you want to *build* the game with Claude but install nothing, open [claude.ai/code](https://claude.ai/code) in your browser, connect this GitHub repository, and paste the kickoff prompt from [README.md](README.md). Claude works on the code in the cloud and the game republishes automatically.

The rest of this guide is for running the game **on your own computer**.

---

## Step 1 — Install Node.js

Node.js is the engine that runs the game's tooling.

1. Go to **https://nodejs.org**
2. Click the big green **LTS** download button (LTS means "the stable version").
3. Open the downloaded file and click **Next** through every screen, accepting the defaults. Nothing needs to be changed.

**Check it worked:** after Step 2 below, type `node --version` and press Enter. You should see something like `v22.11.0`. Any version 18 or higher is fine.

## Step 2 — Open a terminal

A terminal is a window where you type commands to your computer instead of clicking.

- **Windows:** press the **Start** button, type `powershell`, press **Enter**. A blue/black window opens.
- **Mac:** press **Cmd + Space**, type `terminal`, press **Enter**.

Leave this window open — you'll use it for everything below.

## Step 3 — Get the code

Pick ONE option:

**Option A — no extra tools (easiest):**
1. On this project's GitHub page, click the green **Code** button.
2. Click **Download ZIP**.
3. Find the ZIP in your Downloads folder, right-click it → **Extract All** (Windows) or double-click it (Mac).
4. You now have a folder called `critting-ducks-main`.

**Option B — GitHub Desktop app:**
1. Install https://desktop.github.com
2. File → Clone Repository → URL → paste `https://github.com/AustinSchuetz/critting-ducks`

**Option C — command line (if you have git):**
```
git clone https://github.com/AustinSchuetz/critting-ducks.git
```

## Step 4 — Point the terminal at the folder

The terminal needs to be "inside" the game's folder. Type `cd ` (with a space after it), then the folder's location, then Enter. For example, if you extracted the ZIP into Downloads on Windows:

```
cd Downloads\critting-ducks-main
```

**Trick:** type `cd ` then **drag the folder from your file explorer onto the terminal window** — it pastes the full path for you. Then press Enter.

**Check it worked:** the line where you type now ends with the folder name, e.g. `...\critting-ducks-main>`.

## Step 5 — Install the game's building blocks

Type this and press Enter:

```
npm install
```

This downloads the tools the game needs (about a minute).

**Success looks like:** a final line similar to `added 30 packages in 20s`.
**Most common error:** red text mentioning `ENOENT` and `package.json` means the terminal is in the wrong folder — go back to Step 4.

## Step 6 — Run the game

```
npm run dev
```

**Success looks like:** a message showing a web address like `http://localhost:5173/`. Copy that address into any web browser — the game is running on your computer. Leave the terminal window open while you play.

To stop it: click on the terminal and press **Ctrl + C**.

## Step 7 — Build the game with Claude Code (optional)

If you're the one continuing the build:

1. Install Claude Code — instructions at **https://code.claude.com** (there's a desktop app; no terminal skill needed).
2. Open the `critting-ducks` folder in Claude Code.
3. Paste this prompt:

> Read PLAN.md and PROGRESS.md. Continue building the game from the first unchecked phase in PROGRESS.md, following PLAN.md exactly. After completing each phase: verify it per PLAN.md §12, check it off in PROGRESS.md, and commit and push. Ask me before deviating from the plan.

Claude reads the plan, builds the next phase, and checks its work. You can ask it questions in plain English at any time — for example, "show me the game" or "explain what you just did."
