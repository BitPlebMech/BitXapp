# BiT PleB — iOS/iPadOS App: Master Development Plan
> Author: Claude | Date: May 2026  
> Target devices: iPhone 17, iPad Pro (iOS/iPadOS 26)  
> Strategy: iPadOS-first design, universal app, vibe coding with Claude Code  
> Constraint: Gist sync kept compatible with existing web app during transition  

---

## Before Anything Else — Two Tool Roles, One Clear Boundary

This is the most important thing to internalize before you write a single line of Swift.

**Claude Cowork** is a document and planning brain. It reads your existing web codebase, maintains cross-platform tracking, writes architecture docs, and updates the Feature Registry. It cannot build Xcode projects or run Swift.

**Claude Code** is the coding engine. It writes Swift files, runs `xcodebuild`, reads compiler errors, runs tests, manages git. It reads `CLAUDE.md` automatically at the start of every session — that file is the memory bridge between sessions.

```
┌─────────────────────────────────────────────────────────────┐
│                    TOOL RESPONSIBILITY MAP                  │
├──────────────────────────┬──────────────────────────────────┤
│  Claude Cowork           │  Claude Code                     │
├──────────────────────────┼──────────────────────────────────┤
│  Read web app → extract  │  Create Xcode project structure  │
│  feature specs           │  Write all .swift files          │
│                          │                                  │
│  Maintain FEATURE_       │  Run builds (xcodebuild)         │
│  REGISTRY.md             │  Run tests (swift test)          │
│                          │                                  │
│  Write architecture docs │  Fix compiler errors             │
│  Update STATUS.md        │  Manage Package.swift / SPM      │
│  after each sub-phase    │                                  │
│                          │  Port algorithms (JS → Swift)    │
│  Cross-check: "does iOS  │  Wire UI to data                 │
│  have everything web     │                                  │
│  has?"                   │  Git commits at phase checkpoints│
├──────────────────────────┼──────────────────────────────────┤
│  You talk to Cowork when │  You talk to Code when you are   │
│  you are planning,       │  building, fixing, or testing    │
│  reviewing, or tracking  │  Swift code in Xcode             │
└──────────────────────────┴──────────────────────────────────┘
```

**The memory bridge:** `CLAUDE.md` at the root of the iOS project. Every Claude Code session starts by reading it automatically. Every time a sub-phase completes, update this file. This is how Code sessions stay oriented without repeating setup context.

---

## Project Location and Web App Isolation

Your web app lives at:  
`/Users/bitpleb/My Stuff/DashBoard/`  — **never touch this during iOS work**

The iOS project will live at:  
`/Users/bitpleb/My Stuff/BitPlebApp/`  — completely separate directory

There is zero code sharing between them. They share only:
- The **GitHub Gist JSON format** (the three files: `portfolio-data.json`, `ember-highlights.json`, `habits-data.json`) — the iOS app must read and write these in exactly the format the web app expects.
- The **conceptual architecture** — same module isolation philosophy, translated to Swift idioms.

---

## Web App ↔ iOS App Cross-Functional Tracking

**You asked: is there a common log session?**

There is no automatic session sync between Cowork and Claude Code. What replaces it is a file: `FEATURE_REGISTRY.md` maintained in the iOS project's `docs/` folder. This file is the single source of truth for what features exist, on which platform, and what their current status is.

**The workflow:**
1. Claude Cowork scans the web app (done — see feature extract below) and populates the initial Feature Registry
2. When you add a feature to the iOS app in a Claude Code session, you end that session by saying: "Update FEATURE_REGISTRY.md to mark X as complete"
3. When you add a feature to the web app in a future Cowork session, Cowork checks the registry and notes it as pending for iOS
4. At any time, ask Cowork: "What is in the web app that is not yet in the iOS app?" — it reads both codebases and the registry and gives you the diff

This is not magic — it is a discipline. But it is the same discipline you already use with MODULE_RULES.md in your web app. You know how to follow it.

---

## Web App Feature Extract (Cowork-Generated — Source of Truth for Feature Registry)

Extracted from reading all module source files (May 2026).

### Portfolio Module
| Feature | JS Function(s) | Priority for iOS |
|---|---|---|
| Add / Edit / Delete transaction | `addTransaction`, `editTransaction`, `deleteTransaction` | P1 |
| FIFO lot matching | `computePositions` (O(n×m), cached) | P1 |
| XIRR calculation | `calcXIRR` (Newton-Raphson, 7 seeds, 300 iter) | P1 |
| CAGR calculation (≥1yr guard) | `calcCagr`, `yearsHeld` | P1 |
| Position summary (cost, value, P&L, %) | `computeSummary` | P1 |
| FX rates (ECB via frankfurter.app) | `fetchFxLatest`, `getFxRate` | P1 |
| Live price fetch (CoinGecko/Yahoo/AlphaVantage/Mock fallback) | `refreshPrices`, `getPrice` | P1 |
| Price cache (4hr TTL) | `isCacheValid` | P1 |
| Multi-currency display (EUR/USD/INR) | `eurToDisplay`, `currencySymbol` | P1 |
| Asset class tagging (Stock/ETF/Crypto/Bond/MF) | `guessClass` | P2 |
| Transaction history view | `portfolio-ui.js renderHistory` | P1 |
| Lot details per position | `portfolio-ui.js renderLots` | P2 |
| Analytics (charts: allocation, performance) | `portfolio-ui.js renderAnalytics` | P2 |
| CSV import | `Data.parseCSV` | P2 |
| JSON export/import | `exportJSON`, `importJSON` | P2 |
| Undo deleted transaction | `undoDelete` | P3 |
| Ticker rename | `renameTicker` | P3 |
| Gist sync (portfolio-data.json) | `triggerGistSave`, `triggerGistLoad` | P1 |

### Habits Module
| Feature | JS Function(s) | Priority for iOS |
|---|---|---|
| Add / Edit / Archive / Delete habit | `addHabit`, `editHabit`, `archiveHabit`, `deleteHabit` | P1 |
| Daily check-in (toggle) | `toggleCheckIn` | P1 |
| Current streak + longest streak | `getStreakInfo` | P1 |
| 7-day completion rate | `getCompletionRate` | P1 |
| 28-day history (heatmap data) | `getRecentDays` | P1 |
| Total check-ins | `getTotalCheckIns` | P2 |
| Habit icon + color customization | `addHabit ({ icon, color })` | P2 |
| JSON export / import | `exportJSON`, `importJSON` | P3 |
| Gist sync (habits-data.json) | `triggerGistSave` | P1 |

### Ember Module
| Feature | JS Function(s) | Priority for iOS |
|---|---|---|
| Add / Delete source (book) | `getSources`, `deleteSource` | P1 |
| Add / Delete highlight | `getHighlights`, `deleteHighlight` | P1 |
| Import from Kindle / plain text | `ember-data.js parseKindle` | P2 |
| Daily review (date-seeded shuffle) | `getDailyReview` | P1 |
| SM-2 spaced repetition | `_computeSM2`, `submitReview`, `getReviewQueue` | P1 |
| Review streak tracking | `_updateStreak`, `getStreak` | P2 |
| Book categorization (general/academic) | `importParsed(category)` | P2 |
| Email daily digest | `generateDailyDigest`, `_buildEmailHtml` | P3 — replace with push notification |
| Stats (total highlights, sources, review rate) | `getStats` | P2 |
| Quotes sub-feature | `addQuote`, `deleteQuote`, `toggleQuoteStar` | P3 |
| Gist sync (ember-highlights.json) | `triggerGistSave` | P1 |

### App Shell / Settings
| Feature | Web Equivalent | Priority for iOS |
|---|---|---|
| Gist credentials (token + ID entry) | `App.Shell.initLockScreen` | P1 (replaces credential popup) |
| Theme (dark/light) | `App.Shell.applyTheme` | P0 — system default, automatic |
| Currency preference | `settings.js` | P1 |
| Sign out / clear data | `App.Shell.signOut` | P1 |
| Demo mode (sample data) | `App.Shell.enterDemoMode` | P2 |

---

## Phase 0 — Foundation Setup

**Goal:** App builds, runs in iPad Simulator, shows a 3-tab navigation shell with empty placeholder screens. No data. No design work. Just a working skeleton you can run.

**Duration estimate:** 1–2 focused sessions in Claude Code.

---

### Sub-Phase 0.1 — Environment Check (Cowork-guided, then Code)

**Claude Cowork does:**
- This document. Done. ✓

**You do manually (Cowork guides you through this once):**
1. Open Xcode → confirm version is compatible with iOS 26 SDK
2. Sign in to Xcode with your Apple ID (`Xcode → Settings → Accounts`)
3. Connect iPhone 17 via USB once → enable "Connect via network" → disconnect
4. Confirm iPad Pro appears in network devices

**Claude Code does (paste these commands into your terminal):**
```bash
# Verify Xcode command-line tools
xcode-select -p
xcodebuild -version

# Verify your Apple ID is recognized
xcrun altool --list-providers -u "your@appleid.com" --password "@keychain:AC_PASSWORD"
```

---

### Sub-Phase 0.2 — Xcode Project Creation (Claude Code)

**Tell Claude Code exactly this:**
> "Create a new Xcode project at `/Users/bitpleb/My Stuff/BitPlebApp/`. Project name: BitPlebApp. Bundle ID: com.bitpleb.app. Team: Personal Team (free). Target: iOS 18.0 minimum (to be updated to 26). Universal (iPhone + iPad). SwiftUI interface. SwiftData checked. No tests target yet. Create the folder structure as documented in CLAUDE.md."

**Claude Code creates this structure:**
```
BitPlebApp/
├── CLAUDE.md                          ← Session memory (Code reads this every time)
├── docs/
│   ├── FEATURE_REGISTRY.md            ← Cross-platform feature tracking
│   ├── ARCHITECTURE.md                ← iOS architecture decisions
│   └── STATUS.md                      ← Current phase status log
├── BitPlebApp.xcodeproj
├── BitPlebApp/
│   ├── App/
│   │   ├── BitPlebApp.swift           ← @main entry point
│   │   └── AppCoordinator.swift       ← Navigation root (App.Shell equivalent)
│   ├── Core/
│   │   ├── DesignSystem/
│   │   │   ├── Colors.swift           ← Design tokens (from bitxapp-base.css)
│   │   │   ├── Typography.swift
│   │   │   └── Spacing.swift
│   │   ├── Models/                    ← SwiftData model definitions (Phase 2)
│   │   ├── Stores/
│   │   │   └── AppStore.swift         ← Coordinator store (App.Shell equivalent)
│   │   └── Utilities/
│   │       └── Formatters.swift       ← Port of js/core/formatters.js
│   └── Modules/
│       ├── Portfolio/
│       │   ├── PortfolioStore.swift   ← Business logic (Phase 2)
│       │   ├── Views/
│       │   │   └── PortfolioRootView.swift
│       │   └── Components/            ← Reusable sub-views
│       ├── Habits/
│       │   ├── HabitsStore.swift
│       │   ├── Views/
│       │   │   └── HabitsRootView.swift
│       │   └── Components/
│       └── Ember/
│           ├── EmberStore.swift
│           ├── Views/
│           │   └── EmberRootView.swift
│           └── Components/
└── BitPlebAppTests/
    ├── Portfolio/
    ├── Habits/
    └── Ember/
```

**Module isolation rule in Swift (equivalent to your MODULE_RULES.md):**
```swift
// PortfolioStore.swift — the ONLY store Portfolio views may import
// HabitsStore is NOT imported here. EmberStore is NOT imported here.
// Cross-module communication only through AppStore (your App.Shell).
```
Swift's `internal` access modifier (the default) enforces this within a single target. Types in `Portfolio/` that are not marked `public` cannot be accessed from `Habits/` — the compiler catches it. This is better than your current JS discipline because it is mechanical, not manual.

---

### Sub-Phase 0.3 — Design System (Claude Code)

**Goal:** Define design tokens in Swift that mirror `css/bitxapp-base.css`. These are used everywhere. Getting this right now means all future UI work is consistent.

**Claude Code ports this from your CSS:**
```swift
// Core/DesignSystem/Colors.swift
extension Color {
    // Primary palette (from bitxapp-base.css --blue, --green, etc.)
    static let appBlue    = Color(hex: "#5b9cff")
    static let appGreen   = Color(hex: "#00dba8")
    static let appOrange  = Color(hex: "#f97316")
    static let appPurple  = Color(hex: "#a07cf8")
    static let appRed     = Color(hex: "#ef4444")

    // Semantic tokens
    static let surfacePrimary   = Color("SurfacePrimary")   // dark: #0d0d0d
    static let surfaceSecondary = Color("SurfaceSecondary") // dark: #1a1a1a
    static let textPrimary      = Color("TextPrimary")
    static let textSecondary    = Color("TextSecondary")

    // Asset class colors (used in Portfolio)
    static let classStock  = Color(hex: "#5b9cff")
    static let classETF    = Color(hex: "#a07cf8")
    static let classCrypto = Color(hex: "#e8732a")
    static let classBond   = Color(hex: "#00d4ff")
    static let classMF     = Color(hex: "#00dba8")
}
```

Dark/light mode is automatic via `Color(light:dark:)` or named color assets. SwiftUI reads the system preference — you never need `applyTheme()` calls like in the web app.

---

### Sub-Phase 0.4 — App Shell Navigation (Claude Code)

**This is the most important architectural decision in Phase 0.**

**Chosen pattern: Adaptive TabView (iPadOS 18+ sidebarAdaptable style)**

This is Apple's own recommended pattern as of iOS/iPadOS 18 and what their first-party apps use. On iPad it renders as a persistent sidebar. On iPhone it renders as a bottom tab bar. Same code.

```swift
// App/AppCoordinator.swift
struct AppCoordinator: View {
    var body: some View {
        TabView {
            Tab("Portfolio", systemImage: "chart.line.uptrend.xyaxis") {
                PortfolioRootView()
            }
            Tab("Habits", systemImage: "checkmark.circle") {
                HabitsRootView()
            }
            Tab("Ember", systemImage: "flame") {
                EmberRootView()
            }
            Tab("Settings", systemImage: "gear", role: .search) {
                SettingsView()
            }
        }
        .tabViewStyle(.sidebarAdaptable)  // ← the entire magic
    }
}
```

**On iPad in landscape:** Sidebar is always visible. Three module tabs + Settings. Tapping a tab shows its content in the full main area.

**On iPad in portrait / iPhone:** Collapses to standard tab bar or slide-out sidebar.

This replaces your web app's fixed sidebar + topbar entirely with a paradigm users already know from Apple's own apps. No custom navigation code needed. Zero.

---

### Sub-Phase 0.5 — CLAUDE.md Scaffold (Claude Code writes, Cowork maintains)

This file is the most important file in the entire project. Claude Code reads it automatically every session. It must always reflect current state.

```markdown
# BitPlebApp — CLAUDE.md
> iOS/iPadOS universal app. iPadOS-first design.  
> Web app companion: /Users/bitpleb/My Stuff/DashBoard (DO NOT MODIFY)  
> Last updated: [date] | Current phase: 0.5

## Project Status
- [x] 0.1 Environment setup
- [x] 0.2 Xcode project + folder structure
- [x] 0.3 Design system tokens
- [x] 0.4 App shell navigation
- [ ] 0.5 CLAUDE.md scaffold ← YOU ARE HERE

## Architecture Rules (Swift equivalents of web MODULE_RULES.md)
1. Each module store (PortfolioStore, HabitsStore, EmberStore) is INTERNAL by default
2. Modules communicate only through AppStore — never import each other
3. SwiftData models live in Core/Models — never duplicated in modules
4. All Gist JSON must remain byte-compatible with web app format (see docs/GIST_FORMAT.md)
5. Every store function that mutates state must have a unit test

## Gist JSON Compatibility Constraint
The iOS app reads/writes the SAME three Gist files as the web app.
DO NOT change field names, nesting, or types without updating both platforms.
Web format is documented in docs/GIST_FORMAT.md.

## Current Build State
- Simulator: iPad Pro 13" (iPadOS 26) — target for all UI work
- Physical devices: iPhone 17, iPad Pro (wireless, re-sign every 7 days)
- Build: clean as of [date]

## Where Things Live
- Design tokens: Core/DesignSystem/
- Module business logic: Modules/[Name]/[Name]Store.swift
- Module views: Modules/[Name]/Views/
- Shared components: Core/Components/
- Tests: BitPlebAppTests/[Name]/
```

---

### Phase 0 Deliverable

Run in Xcode Simulator (iPad Pro 13"). You see:
- A sidebar on the left with Portfolio, Habits, Ember, Settings icons and labels
- Tapping each shows a placeholder screen with the module name
- Dark mode works (system default)
- Build is clean (zero warnings is the target, zero errors is the requirement)
- Git: initial commit tagged `phase-0-complete`

---

## Phase 1 — UI/UX Exploration (Static, No Data)

**Goal:** Make the app feel real without a single line of data or business logic. Every screen is navigable. Everything is hardcoded mock data. This phase is purely about feel, layout, and visual design.

**Duration estimate:** 3–5 Claude Code sessions, iterating on Previews.

**The rule for this phase:** No `@State` that persists. No `@Environment`. No stores. Just `View` structs with hardcoded constants. This is your design sandbox.

---

### Sub-Phase 1.1 — Component Library (Claude Code)

Build reusable components that every module uses. These live in `Core/Components/`.

**Components to build:**
```
Core/Components/
├── KPICard.swift          ← Metric card (value + label + trend indicator)
├── SectionHeader.swift    ← Section title with optional action button
├── EmptyState.swift       ← "Nothing here yet" placeholder with icon
├── StatusBadge.swift      ← Colored pill (Stock, ETF, Crypto, etc.)
├── ChangeIndicator.swift  ← +4.2% in green / -1.3% in red
├── ActionSheet.swift      ← Bottom sheet for add/edit forms (iPadOS style)
└── LoadingShimmer.swift   ← Skeleton loading animation
```

**In Xcode Previews, you play with these like this:**
```swift
#Preview("KPI Card — Light") {
    KPICard(title: "Total Value", value: "€42,350", change: "+4.2%", trending: .up)
        .preferredColorScheme(.light)
}
#Preview("KPI Card — Dark") {
    KPICard(title: "Total Value", value: "€42,350", change: "+4.2%", trending: .up)
        .preferredColorScheme(.dark)
}
```
You can pin these previews and edit the Swift file side-by-side. This is your CSS DevTools equivalent.

---

### Sub-Phase 1.2 — Portfolio UI (Static)

**iPadOS layout strategy: Two-column NavigationSplitView within the Portfolio tab**

```
┌─────────────────┬──────────────────────────────────────────────┐
│  [Sidebar]      │                                              │
│  Portfolio  ←   │   PORTFOLIO DETAIL AREA                      │
│  Habits         │                                              │
│  Ember          │   [Overview]  [Positions]  [History]  [Analytics] │
│  Settings       │   ─────── Segmented picker ───────           │
│                 │                                              │
│                 │   KPI row: Total Value | P&L | XIRR | CAGR   │
│                 │   ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│                 │   │  €42,350 │ │ +€3,210  │ │  12.4%   │    │
│                 │   └──────────┘ └──────────┘ └──────────┘    │
│                 │                                              │
│                 │   [Allocation pie chart — Swift Charts]      │
│                 │                                              │
│                 │   Positions list                             │
│                 │   ┌─────────────────────────────────────┐   │
│                 │   │ 🔵 AAPL  Apple Inc.    +12.3%  €8,200│   │
│                 │   │ 🟣 QQQ   Invesco QQQ   +8.1%   €6,400│   │
│                 │   │ 🟠 BTC   Bitcoin       -2.1%   €5,100│   │
│                 │   └─────────────────────────────────────┘   │
└─────────────────┴──────────────────────────────────────────────┘
```

**Screens to mock (all hardcoded):**
1. Overview — KPI cards + mini allocation chart
2. Positions list — each position as a card with ticker, name, value, P&L %, asset class badge
3. Position detail — tapping a position shows lots, transaction history, individual XIRR
4. Add Transaction sheet — form (ticker, type BUY/SELL, quantity, price, date, currency)
5. Analytics — allocation pie, asset class breakdown

---

### Sub-Phase 1.3 — Habits UI (Static)

**iPadOS layout: Single column with generous spacing (habits is not a data-dense module)**

```
┌─────────────────┬──────────────────────────────────────────────┐
│  [Sidebar]      │                                              │
│  Habits    ←    │   HABITS                        + Add Habit  │
│                 │                                              │
│                 │   ┌────────────────────────────────────────┐ │
│                 │   │ 🏃 Morning Run          ●●●●●●○ 6/7    │ │
│                 │   │ Streak: 14 days         [Check In ✓]   │ │
│                 │   └────────────────────────────────────────┘ │
│                 │   ┌────────────────────────────────────────┐ │
│                 │   │ 📚 Read 20 pages        ●●●●○○○ 4/7    │ │
│                 │   │ Streak: 4 days          [Check In]     │ │
│                 │   └────────────────────────────────────────┘ │
│                 │                                              │
│                 │   Heatmap (28-day grid)                      │
│                 │   [mini calendar showing completion]         │
└─────────────────┴──────────────────────────────────────────────┘
```

**Screens to mock:**
1. Habits list — each habit as a card with icon, streak, 7-day indicator dots, check-in button
2. Habit detail (tap) — full heatmap, streak stats, completion rate
3. Add Habit sheet — name, icon picker (emoji), color picker

**The check-in button interaction:** On tap, the button animates (scale up + haptic + color fill). This is the moment you feel the difference from a web app. Use `.sensoryFeedback(.success, trigger: checkedIn)` — one line.

---

### Sub-Phase 1.4 — Ember UI (Static)

**iPadOS layout: Book shelf + review interface**

```
┌─────────────────┬──────────────────────────────────────────────┐
│  [Sidebar]      │                                              │
│  Ember     ←    │  [Books]  [Daily Review]  [Queue]  [Stats]   │
│                 │                                              │
│                 │  BOOKS                          + Add Book   │
│                 │  ┌────┐ ┌────┐ ┌────┐ ┌────┐               │
│                 │  │    │ │    │ │    │ │    │               │
│                 │  │ 📕 │ │ 📗 │ │ 📘 │ │ 📙 │  (spines)    │
│                 │  │    │ │    │ │    │ │    │               │
│                 │  └────┘ └────┘ └────┘ └────┘               │
│                 │  Atomic  Deep  Thinking  Zero               │
│                 │  Habits  Work  Fast&Slow  to One            │
│                 │                                              │
│                 │  DAILY REVIEW                               │
│                 │  ┌──────────────────────────────────────┐   │
│                 │  │  "We are what we repeatedly do..."   │   │
│                 │  │              — Aristotle              │   │
│                 │  │  From: Atomic Habits                  │   │
│                 │  └──────────────────────────────────────┘   │
│                 │  [Again]  [Hard]  [Good]  [Easy]             │
└─────────────────┴──────────────────────────────────────────────┘
```

**Screens to mock:**
1. Books shelf — visual book spine grid (colored strips with title, same palette as web SPINE_PALETTE)
2. Book detail — list of highlights from that book
3. Daily review card — highlight text + source + SM-2 rating buttons
4. Review queue list — upcoming reviews sorted by date
5. Add book/highlight sheet

---

### Sub-Phase 1.5 — Settings UI (Static)

```
Form {
    Section("Account") {
        LabeledContent("Gist Token") { SecureField }
        LabeledContent("Gist ID") { TextField }
        Button("Sign In")
        Button("Sign Out", role: .destructive)
    }
    Section("Display") {
        Picker("Currency", selection: ...) { }
        Toggle("Push Notifications", isOn: ...)
    }
    Section("Data") {
        Button("Export Portfolio CSV")
        Button("Import Highlights")
    }
}
```

SwiftUI `Form` renders this as the exact native iOS Settings look — no design work needed.

---

### Sub-Phase 1.6 — Polish Pass (Claude Code)

Before declaring Phase 1 done:
- [ ] Every screen works in Dark Mode (automatic, just verify)
- [ ] Every screen works in both iPad landscape and portrait
- [ ] Every screen works on iPhone (tab bar collapses correctly)
- [ ] Dynamic Type: increase text size in Simulator settings, nothing breaks
- [ ] No hardcoded colors — everything uses `Color.appBlue`, `Color.surfacePrimary` etc.
- [ ] SwiftUI Previews exist for every major view and every component

**Phase 1 Deliverable:**
- All screens navigable with hardcoded data
- App feels like a real native app (not a web page)
- You have demonstrated: check-in haptic, sheet animations, sidebar navigation, charts
- You feel whether the layout works on your actual iPad before writing a single data line
- Git: tagged `phase-1-complete`

---

## Phase 2 — Data Architecture + Algorithm Layer

**Goal:** The app persists real data. All algorithms ported and unit-tested. Gist sync working. Static mock data replaced with real stores.

**Duration estimate:** 3–5 Claude Code sessions.

---

### Sub-Phase 2.1 — SwiftData Models (Claude Code)

Models must match Gist JSON exactly. This is a hard constraint.

```swift
// Core/Models/Transaction.swift
@Model
final class Transaction {
    var id: String          // matches web: UUID string
    var ticker: String
    var type: String        // "BUY" or "SELL" — keep as string for Gist compat
    var quantity: Double
    var price: Double       // in EUR (same as web app stores)
    var date: String        // "YYYY-MM-DD" — keep as string for Gist compat
    var currency: String    // "EUR", "USD", "INR"
    var notes: String
}

@Model
final class Habit {
    var id: String
    var name: String
    var icon: String        // emoji string
    var color: String       // hex string "#5b9cff"
    var archived: Bool
    var createdAt: String
    var logs: [HabitLog]    // relationship
}
// ... Highlight, Source, etc.
```

**Why strings for dates and types:** Your Gist format uses "YYYY-MM-DD" strings and "BUY"/"SELL" strings. The iOS model mirrors this exactly so JSON serialization is trivial. You convert to `Date` and `enum` at the Store layer for computation, not at the model layer.

---

### Sub-Phase 2.2 — Algorithm Ports + Unit Tests (Claude Code)

This is where Claude Code earns its place. Give it the JS function and say "port this to Swift with unit tests that match the web app's expected output for these inputs."

**For each algorithm:**

```
1. Port JS → Swift
2. Write test inputs that match what the web app computes for your real portfolio data
3. Run swift test
4. Fix any discrepancies (edge cases in same-date FIFO ordering, XIRR seed selection)
5. Both implementations must produce identical results for identical inputs
```

Test targets:
```swift
// BitPlebAppTests/Portfolio/XIRRTests.swift
func testXIRR_singleBuySell() {
    let cashflows = [
        (date: "2023-01-01", amount: -1000.0),  // BUY
        (date: "2024-01-01", amount: 1200.0),    // current value
    ]
    let result = calcXIRR(cashflows: cashflows)
    XCTAssertEqual(result!, 0.2, accuracy: 0.001)  // ~20% annual return
}

func testFIFO_sameDayBuySell() {
    // The critical edge case from your web app:
    // BUY and SELL on same day → BUY processed first
}

func testStreak_checkedToday() { ... }
func testStreak_gracePeriod() { ... }
func testSM2_correctAnswer() { ... }
func testSM2_wrongAnswerResetsInterval() { ... }
```

---

### Sub-Phase 2.3 — Store Layer (Claude Code)

```swift
// Modules/Portfolio/PortfolioStore.swift
@Observable
final class PortfolioStore {
    private(set) var positions: [Position] = []
    private(set) var summary: PortfolioSummary?
    private var isDirty = true

    // AppStore injects the ModelContext — PortfolioStore never creates its own
    init(context: ModelContext) { ... }

    func addTransaction(_ tx: TransactionInput) {
        // mutate → save to SwiftData → isDirty = true → recompute
    }

    func computePositions() -> [Position] {
        // port of portfolio.js computePositions()
        // memoized on isDirty flag (same pattern as web app _posDirty / _posCache)
    }
}
```

**AppStore (App.Shell equivalent):**
```swift
// Core/Stores/AppStore.swift
@Observable
final class AppStore {
    let portfolio: PortfolioStore
    let habits: HabitsStore
    let ember: EmberStore

    // Modules never access each other directly.
    // Cross-module coordination (e.g. show toast) goes through AppStore.
    func showToast(_ message: String, type: ToastType) { ... }
    func triggerGistSave() async { ... }  // saves all three modules
}
```

---

### Sub-Phase 2.4 — Gist Sync Layer (Claude Code)

This is the bridge between old and new. The iOS app reads the same three Gist files as the web app.

```swift
// Core/Utilities/GistSync.swift
actor GistSync {
    // actor = Swift's concurrency primitive. Prevents race conditions
    // mechanically — no manual _gistSaveInProgress lock needed (your web app
    // had to build this manually in app-shell.js; Swift gives it for free)

    func saveAll(portfolio: PortfolioData, habits: HabitsData, ember: EmberData,
                 token: String, gistId: String) async throws {
        // PATCH portfolio-data.json
        // PATCH ember-highlights.json
        // PATCH habits-data.json
        // All three in parallel using async let
    }

    func loadAll(token: String, gistId: String) async throws -> (PortfolioData, HabitsData, EmberData) {
        // GET all three files in parallel
    }
}
```

**Swift `actor` eliminates your race-condition lock.** The `_gistSaveInProgress` flag you had to manually manage in `app-shell.js` is not needed — Swift's actor guarantees serial access to `GistSync` methods by the runtime.

---

### Phase 2 Deliverable
- App reads your real portfolio data from Gist on first launch (enter token + Gist ID in Settings)
- All three modules show live data
- XIRR, FIFO, streak, SM-2 all produce output matching the web app for identical data
- Unit test suite passes (green in Xcode)
- Gist save works and web app can still read the saved file
- Git: tagged `phase-2-complete`

---

## Documentation Workflow (Every Phase)

At the end of every sub-phase:

**Claude Code session ends with:**
```
"Update CLAUDE.md: mark sub-phase X.X complete. Note any architectural decisions made. 
 Update FEATURE_REGISTRY.md for features implemented this session."
```

**When starting a new Claude Code session:**
```
"Read CLAUDE.md and tell me the current status before we begin."
```

**Monthly Cowork session (cross-functional check):**
```
"Read the web app at /DashBoard/js/modules/ and the iOS FEATURE_REGISTRY.md.
 Tell me what features exist in the web app that are not yet in the iOS app."
```

This is your version control for intent, separate from git's version control for code.

---

## Anticipated Challenges (and Mitigations)

| Challenge | Why It Happens | Mitigation |
|---|---|---|
| Gist JSON format drift | iOS app changes a field name | GIST_FORMAT.md is the spec. Unit test that serialization produces byte-identical output to web app for same inputs. |
| SwiftUI Preview crashes | Preview needs data but no ModelContext exists | Always build preview-safe mock factories: `Transaction.preview`, `Habit.preview`. Never use real stores in previews. |
| Xcode project becoming messy | Adding files without structure | CLAUDE.md documents where every new file goes. Code reads it before creating files. |
| Algorithm edge cases (XIRR diverges) | JS float behavior vs Swift Double | Unit tests with known web app outputs catch this. Port the same 7 seed points in the same order. |
| Claude Code session loses context | Long session, context window fills | CLAUDE.md always reflects current state. New session = read CLAUDE.md first. |
| iPad layout breaks on iPhone | Over-indexing on iPad design | Test in both simulators at end of every sub-phase. `.horizontalSizeClass` environment value handles most cases. |
| The 7-day re-sign interrupts daily use | Certificate expires while you are not at Mac | AltStore (optional), or just build the habit: Monday morning, open Xcode, hit Run. 60 seconds. |

---

## Next Steps Trigger List

When you say "start Phase 0", open a Claude Code session and paste:

> "Read the CLAUDE.md file at /Users/bitpleb/My Stuff/BitPlebApp/CLAUDE.md if it exists, or read docs/iOS_MASTER_PLAN.md at /Users/bitpleb/My Stuff/DashBoard/docs/iOS_MASTER_PLAN.md for full context. We are starting Sub-Phase 0.2 — Xcode project creation. Create the project and folder structure as documented."

When you say "start Phase 1", paste:

> "Read CLAUDE.md at /Users/bitpleb/My Stuff/BitPlebApp/CLAUDE.md. Phase 0 is complete. We are starting Phase 1 Sub-Phase 1.1 — Component Library. Build the KPICard, SectionHeader, EmptyState, StatusBadge, ChangeIndicator, ActionSheet, and LoadingShimmer components with SwiftUI Previews for each."
