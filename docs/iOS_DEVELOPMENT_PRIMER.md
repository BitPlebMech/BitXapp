# BiT PleB — iOS & iPadOS Development Primer
> Written: May 2026 | Audience: Rohan, solo developer, moving from web → native Apple  
> Context: Existing ~14,500 LOC vanilla JS web app (Portfolio + Habits + Ember), targeting iPhone 17 + iPad Pro on iOS/iPadOS 26

---

## A Note Before We Begin

I have read your full architecture. Your web app is unusually well-disciplined for a solo vibe-coded project — the module isolation, single state layer, Shell/Action registry, and Gist sync lock are patterns that experienced engineers enforce. That is not an accident; it will directly help you here. The mental models transfer. The code does not — and that is fine, because native Swift will be better for what you want to build.

---

## 1. iOS First or iPadOS First?

**Start with iOS (iPhone). Build universal from day one.**

Here is why this is not a debate:

In Xcode, you do not choose between "an iPhone app" or "an iPad app." You create a single project that targets both via a `Universal` target setting. The same Swift code, the same data layer, the same business logic — the UI layer adapts. Apple calls this adaptive layout, and SwiftUI is purpose-built for it.

The practical workflow is: design and test on iPhone Simulator first (smaller canvas forces constraint), then open iPad Simulator and fix what breaks. Because iPhone has the tighter constraints (smaller screen, no split-screen multitasking), getting iPhone right first means iPad is mostly additive work — you unlock more space, rearrange panels, maybe add a sidebar column. The reverse is painful: iPad layouts often assume space that iPhone does not have.

**One concrete benefit for you specifically:** Your web app already has a sidebar + main-pane layout. On iPad, SwiftUI's `NavigationSplitView` gives you exactly this natively — a collapsible sidebar with a detail pane. On iPhone, the same code collapses automatically into a drill-down navigation stack. You write it once.

**The cost of doing them separately would be:** maintaining two codebases for identical business logic. Never do this for a personal project.

---

## 2. Native UI/UX — SwiftUI is the Right Choice

You said you want to avoid WebKit-based hybrid approaches. That is the correct instinct. Here is the landscape:

| Approach | What it is | Verdict for your case |
|---|---|---|
| **SwiftUI** | Apple's modern declarative UI framework (2019+) | ✅ Use this |
| **UIKit** | Apple's older imperative UI framework (2008+) | ⚠️ Still relevant, but not the starting point in 2026 |
| **SwiftUI + UIKit interop** | Embed UIKit views inside SwiftUI where needed | ✅ Valid when SwiftUI has gaps |
| **React Native / Flutter** | Cross-platform, compiles to native-ish UI | ❌ Defeats your purpose, not truly native feel |
| **WKWebView (WebKit)** | Embed your existing HTML/JS in a native shell | ❌ You correctly rejected this |

SwiftUI on iOS 26 is mature. The rough early years (2019–2022) where it was missing critical components are behind it. For the feature set you need — lists, charts, cards, forms, navigation — SwiftUI handles everything natively.

**What "native" actually means for your app:**

- Portfolio card with live price → `Chart` (Apple's Swift Charts, free, built-in since iOS 16)
- Habit heatmap → custom `Canvas` drawing or `Grid` layout in SwiftUI
- Ember book shelf → `ScrollView` + `LazyVGrid` with custom card views
- Spaced repetition review → `TabView` with swipe gestures
- Settings → `Form` + `Section` (SwiftUI renders it as the system settings style automatically)

The physics, animations, haptics, fonts — all system-native by default. Your users will feel the difference immediately versus a WebView app.

---

## 3. Designing and Playing with UI/UX in Xcode

**Yes — Xcode has a live canvas called SwiftUI Previews. It is your primary UI/UX sandbox.**

Here is how it works: Every SwiftUI view file has a `#Preview` block at the bottom. Xcode renders this in a side canvas in real time as you type. You can:

- Preview on multiple device sizes simultaneously (iPhone 17, iPad Pro, both)
- Preview in Dark Mode and Light Mode side by side
- Preview with different Dynamic Type sizes (accessibility font scaling)
- Click and interact with the preview — it is a running simulator embedded in the editor
- Pin a preview while editing other files, so your card component stays visible while you edit its data layer

This is called **design-in-code**, and it is faster than the browser DevTools workflow you know because there is no browser rendering pipeline — what you see in the preview is pixel-identical to what runs on device.

**Additional tools:**

- **Xcode Simulator:** Full device simulators for every iPhone and iPad model, running the real OS. Run your app there before touching your physical device.
- **Swift Playgrounds (iPad app / Mac app):** A lightweight sandbox for experimenting with SwiftUI layouts and Swift algorithms without a full Xcode project. Good for prototyping a single screen or testing a math function before integrating it.
- **Instruments:** Apple's profiler — CPU, memory, hang detection, energy impact. You will need this before shipping.

---

## 4. Your JavaScript Math → Swift: What Actually Happens

This is the most technically interesting question you asked, and I want to be precise.

**The algorithms are language-agnostic. The translation is mechanical, not creative.**

Your three critical algorithms:

### XIRR (Newton-Raphson solver)
Your `calcXIRR` in `portfolio.js` — 7 seed points, 300 iterations, Newton-Raphson — translates directly to Swift. The math is identical. Swift's type system will actually make it safer (no silent `NaN` propagation). This is a straight port: for-loops, array operations, arithmetic. One afternoon's work.

```swift
// The structure in Swift looks almost identical to your JS version
func calcXIRR(cashflows: [(date: Date, amount: Double)]) -> Double? {
    let seeds = [0.1, 0.0, -0.05, 0.5, 1.0, -0.3, 2.0]
    // ... same Newton-Raphson logic
}
```

### FIFO Lot Matching
Your FIFO algorithm in `portfolio.js` (`computePositions`) — sort by date, BUY before SELL, consume lots — is pure array manipulation. Swift arrays, sorting, and structs make this cleaner than the JS version. Direct port.

### SM-2 Spaced Repetition (Ember)
Your SM-2 variant — `interval × easeFactor`, reset on wrong answer, sort by `nextReview` — is perhaps 30 lines of logic. Translates directly. Swift's `Date` and `Calendar` APIs are richer than JS `Date`, so this actually gets easier.

### Streak Logic (Habits)
The `getStreakInfo` walk-back — `dayOffset` counting confirmed days — is trivial to port. Swift's `Calendar.current.isDate(_:inSameDayAs:)` makes date comparison cleaner than your string-based `_daysAgo` approach.

**Can Claude transform the JS to Swift?** Yes, with supervision. Claude Code (discussed below) can port a function reliably if you give it the JS source and ask for a Swift equivalent with the same behaviour. You then test it in Swift Playgrounds or against unit tests. Do not paste-and-trust — read the output and verify the edge cases match. The XIRR seed selection and FIFO same-date ordering are the edge cases to watch.

**What about using C?** You asked if the math could be in C. You can embed C code in a Swift project via a bridging header — Swift interoperates with C natively. But there is no reason to. Swift is fast enough for this computation (FIFO + XIRR on a few hundred transactions runs in milliseconds). Pure Swift is simpler, safer, and more maintainable. C would be justified only if you were processing millions of rows or doing real-time signal processing.

---

## 5. Data Management on iOS

Your web app uses `localStorage` + GitHub Gist. Both of these have direct iOS equivalents and one significant upgrade path.

### The Layer Map

| Web (current) | iOS Native equivalent | Notes |
|---|---|---|
| `App.State` (single source of truth) | `@Observable` class / `EnvironmentObject` | Same pattern, reactive by default |
| `localStorage` (key-value, JSON) | **SwiftData** (iOS 17+) | Proper relational persistence, not key-value |
| GitHub Gist sync | **CloudKit / iCloud** | Native, free, no GitHub token needed |
| `DEFAULT_STATE` deep-merge | SwiftData migrations | Structured, versioned schema evolution |
| `super_app_v1` JSON blob | SwiftData `ModelContainer` | Multiple entity types, queried separately |

### SwiftData — Use This

SwiftData (introduced iOS 17, significantly improved in iOS 18+, mature on iOS 26) is Apple's modern persistence layer. It replaces the manual JSON serialization you're doing now:

```swift
// Your Transaction becomes a real model
@Model
class Transaction {
    var id: UUID
    var ticker: String
    var type: TransactionType  // enum: BUY, SELL
    var quantity: Double
    var price: Double
    var date: Date
    var currency: String
}
```

No `JSON.stringify`. No `localStorage.setItem`. No deep-merge logic on load. SwiftData handles persistence, migration, and querying. Your `App.State` layer becomes a `@Observable` class that holds your SwiftData `ModelContext` — same architectural role, better infrastructure underneath.

### iCloud Sync — Replace GitHub Gist

This is the upgrade I would push hardest. Your GitHub Gist sync is clever but fragile — it requires a PAT, has a race condition lock you had to build manually, scrubs tokens to avoid GitHub revocation, and requires three separate API calls. On iOS, you get iCloud sync for free:

```swift
// One line in your app setup
let container = ModelContainer(for: Transaction.self, Habit.self, Highlight.self,
                               configurations: ModelConfiguration(cloudKitDatabase: .automatic))
```

That single configuration gives you: automatic sync across iPhone + iPad + Mac, conflict resolution, offline queue with automatic retry when network returns, no PAT management, no Gist IDs for the user to remember.

**The credential popup you built in `app-shell.js` disappears entirely.** The user signs in with their Apple ID — which they already did when they set up the device.

### State Architecture Mapping

Your `App.State` → `App.Shell` → module chain maps cleanly to:

```
SwiftData ModelContainer       ← your App.State (persistence layer)
    ↓
@Observable AppStore class     ← your App.Shell (orchestrator, routing)
    ↓
Module @Observable classes     ← PortfolioStore, HabitsStore, EmberStore
    ↓
SwiftUI Views                  ← your *-ui.js files
```

The no-cross-module-coupling rule you enforce with the Action Registry translates to: modules communicate only through the `AppStore` coordinator, never by importing each other. Same principle, enforced by Swift's module system (separate Swift packages or targets) instead of manual discipline.

---

## 6. Super App vs Three Separate Apps

**For your current goal (personal + family): one super app.**  
**For monetization at scale: three separate apps, or one with in-app purchases.**

Here is the developer's honest breakdown:

### Why One Super App Now

- One Xcode project, one SwiftData container, one iCloud sync setup
- Shared infrastructure (authentication, theming, navigation) written once
- Your data is inherently linked — a user is the same person across Portfolio, Habits, Ember
- Simpler to maintain, simpler to share with family (one install, one app icon)
- Your modular architecture already handles this — the discipline you built in JS maps directly

### How to Stay Modular in Xcode

Xcode supports the same isolation you've built into your web app via **Swift Package Manager (SPM) local packages**:

```
BitPlebApp/                    ← Main Xcode project
├── App/                       ← AppShell equivalent
│   ├── AppCoordinator.swift   ← routing
│   ├── AppStore.swift         ← state coordinator
│   └── ContentView.swift      ← top-level navigation
├── Packages/
│   ├── PortfolioKit/          ← portfolio module (local Swift package)
│   │   ├── Models/
│   │   ├── Store/
│   │   └── Views/
│   ├── HabitsKit/
│   └── EmberKit/
└── Shared/
    ├── DesignSystem/          ← your design tokens / CSS equivalent
    └── CoreData/              ← SwiftData models
```

Each `Kit` package has its own public API surface. `HabitsKit` cannot access `PortfolioKit` internal types — the Swift compiler enforces it with `internal` vs `public` access control. You get the same isolation your MODULE_RULES.md enforces, but now the compiler catches violations instead of code review.

### When to Split Into Three Apps

Only when: you want separate App Store listings, separate pricing, separate review cycles, or the app bundles grow large enough that users don't want all three. That is a year or more away for you. Optimize for building something good first.

---

## 7. Libraries — Free vs Paid

### What Apple Gives You Free (Use These First)

| Feature | Apple Framework | Notes |
|---|---|---|
| Charts (line, bar, pie, area) | **Swift Charts** (iOS 16+) | Replaces your Chart.js entirely |
| Data persistence | **SwiftData** | Replaces localStorage + your state layer |
| iCloud sync | **CloudKit** | Replaces GitHub Gist |
| Networking | **URLSession / async-await** | Replaces your `fetch()` calls |
| Widgets (home screen, lock screen) | **WidgetKit** | No web equivalent |
| Notifications | **UserNotifications** | Habit reminders, Ember review prompts |
| Push notifications | **APNs** (Apple Push Notification service) | Free but requires Apple Developer account |
| Biometric auth | **LocalAuthentication** | Face ID / Touch ID app lock |
| Haptics | **UIFeedbackGenerator** | Tactile feedback on interactions |
| Accessibility | Built into every SwiftUI component | |
| Localization | **String Catalogs** | |

### Open Source Libraries Worth Considering

| Library | Purpose | License | Notes |
|---|---|---|---|
| **Alamofire** | Networking | MIT | Only needed if URLSession becomes verbose for you. Often unnecessary. |
| **KeychainAccess** | Secure credential storage | MIT | If you need to store anything sensitive beyond iCloud |
| **SwiftUIX** | SwiftUI extension components | MIT | Gap-fillers for missing SwiftUI components |
| **Inject** | Hot reload in Simulator (dev only) | MIT | Dramatically speeds up UI iteration |

### What You Almost Certainly Do Not Need

- A third-party charting library — Swift Charts handles your portfolio graphs natively
- A third-party networking library — async/await URLSession is clean enough
- A third-party database — SwiftData with iCloud is your stack
- Any JS-to-Swift bridge — you are not doing hybrid development

### What Has a Cost

| Item | Cost | Notes |
|---|---|---|
| Apple Developer Program | **$99/year USD** | Required for App Store distribution and iCloud (CloudKit) production entitlements |
| TestFlight (beta distribution) | Free (included in $99) | How you share with family before App Store |
| Xcode | Free | Available on Mac App Store |
| Swift Playgrounds (Mac/iPad) | Free | Prototyping sandbox |
| App Store listing | Free (included in $99) | Apple takes 30% of revenue (15% for small developers earning under $1M/year) |

**Sideloading to your own devices without paying $99:** You can run your app on up to 3 personal devices using a free Apple ID and Xcode. The provisioning certificate expires every 7 days and you must reconnect to Xcode to renew it. Annoying for daily use, but fine for early development phases.

**My recommendation:** Pay the $99 when you are ready to share with family via TestFlight. That is the right moment — not before.

---

## 8. App Store — What It Actually Costs and Requires

### Money

- $99/year Apple Developer Program membership
- 15% commission on revenue under $1M/year (Small Business Program)
- 30% commission above $1M/year

### Time (App Review)

- First submission: 1–3 days typical review time
- Updates: often 24 hours or less
- Rejections are common for first-time developers — read the App Store Review Guidelines before you design features, not after

### Common Rejection Reasons Relevant to Your App

- **Guideline 4.2 (Minimum Functionality):** An app that is "just a website" gets rejected. A native app with WebViews and no native functionality is rejected. Since you want native SwiftUI, this is not a problem.
- **Guideline 5.1 (Privacy):** You must have a Privacy Policy URL even for a free personal app. Required.
- **Guideline 2.1 (App Completeness):** Crashes, broken flows, test data visible = rejection. Have your sample data mode clean.
- **Guideline 3.1 (In-App Purchases):** If you charge for features, it must go through Apple's IAP system. You cannot charge via Stripe directly for digital features.

### For Personal / Family Use Only

You can distribute to family members without the App Store using **TestFlight** (up to 100 internal testers on your developer account). This is the right distribution channel for the near term — no public App Store listing needed, no review for internal builds.

---

## 9. Claude Cowork vs Claude Code — Which Tool for iOS Development

**Claude Code, unambiguously.**

Here is the honest comparison:

| Capability | Cowork (what you've been using) | Claude Code |
|---|---|---|
| Read/write files | ✅ | ✅ |
| Execute shell commands | Limited sandbox | ✅ Full terminal access |
| Run Xcode builds (`xcodebuild`) | ❌ | ✅ |
| Run Swift tests (`swift test`) | ❌ | ✅ |
| Read compiler error output | ❌ | ✅ |
| Use `xcrun simctl` (Simulator control) | ❌ | ✅ |
| Git operations | ❌ | ✅ |
| Install Swift packages | ❌ | ✅ |
| Grep across a large Xcode project | Limited | ✅ |
| Understand build system context | ❌ | ✅ |

Cowork has been the right tool for your web app because it is a simple file system with no build step. iOS development has a build step, a compiler, a test runner, a simulator, a provisioning system, and a package manager — all of which Claude Code can drive from the terminal. Cowork cannot.

**My recommendation:** Continue using Cowork for what it is good at — documents, planning, markdown files like this one, managing your non-code assets. Use Claude Code as your primary coding partner for the Xcode project.

---

## 10. Xcode + Claude: The Integrated Workflow

You have: MacBook Pro + Xcode + VSCode + Claude Code. Here is how they fit together.

### The Physical Setup

```
Terminal (Claude Code running)    ←→    Xcode (open simultaneously)
          ↕                                      ↕
    Swift files on disk              Xcode reads file changes live
```

Claude Code runs in your terminal. It edits `.swift` files directly on your filesystem. Xcode is open at the same time and picks up file changes automatically. When Claude Code saves a Swift file, Xcode re-indexes it within seconds. You can switch to Xcode, hit ⌘R to build and run, and see the result in the Simulator.

### What You Direct Claude Code to Do

- "Port this JS function to Swift and write a unit test for the edge cases"
- "Read the build error and fix it" — paste the Xcode build log, Claude Code reads and patches
- "Add a new SwiftData model for Highlights and wire it into the existing ModelContainer"
- "Create the EmberKit package structure following the same pattern as PortfolioKit"
- "Run `swift test` and fix the failing test" — Claude Code reads the test output and iterates

### VSCode's Role

VSCode with the **Swift extension** (from Swift.org) gives you syntax highlighting, SourceKit-LSP code completion, and inline diagnostics for Swift files. It is a decent editor for Swift — but it cannot build or run iOS apps. Xcode is mandatory for that. Use VSCode when you want a lighter editing environment; use Xcode when you need the Simulator, Instruments, or Interface Builder.

**Practical division:**
- VSCode: editing Swift files, reviewing diffs, reading documentation
- Xcode: building, running in Simulator, debugging, SwiftUI Previews, signing/distribution
- Terminal (Claude Code): all automated work, file generation, running tests, git

### The Vibe Coding Loop for Swift

```
1. Describe the feature to Claude Code in plain English
2. Claude Code reads relevant existing Swift files for context
3. Claude Code writes or edits Swift files
4. You switch to Xcode → ⌘B (build) to catch compile errors
5. If errors: paste build log back to Claude Code → it patches
6. ⌘R to run in Simulator → visual check
7. For regressions: run `swift test` via Claude Code in terminal
8. Commit via Claude Code when stable
```

This loop is faster than you think once the project structure is established.

---

## 11. Your Devices: iPhone 17 + iPad Pro on iOS/iPadOS 26

This is actually a strong position to be in. iOS 26 means you can use every modern API without worrying about backward compatibility — the latest SwiftData improvements, the latest Swift Charts, the latest Navigation APIs, everything.

**One practical note:** iOS 26 is very recent software. If you are using a beta, expect Xcode to also need to be on a corresponding beta. Track Apple's developer release notes for breaking changes in APIs you rely on. Build against the iOS 26 SDK from the start — do not try to support iOS 15 or 16. You are building for yourself and family; you control the devices.

**Testing workflow:**
- Day-to-day: Xcode Simulator (fast, no physical device needed)
- Before each milestone: install on iPhone 17 and iPad Pro via Xcode direct install (USB or wireless)
- Before sharing with family: TestFlight distribution

---

## 12. Coarse Workflow — From Zero to Working App

This is the sequence a professional iOS developer would follow for your project. Think of it in phases.

### Phase 0: Foundation (1–2 weeks)
- Set up Xcode project with Universal target (iPhone + iPad)
- Configure SwiftData container with iCloud entitlement
- Define all data models: `Transaction`, `Habit`, `HabitLog`, `Highlight`, `Source`
- Create `AppCoordinator` (your App.Shell equivalent) and tab/sidebar navigation shell
- Establish the design system: colors, typography, spacing tokens in Swift

### Phase 1: Portfolio Module (2–3 weeks)
- Port FIFO, XIRR, CAGR algorithms to Swift with unit tests
- Build `PortfolioStore` with SwiftData queries
- Implement price fetching with URLSession (replace your `fetchFX` / `refreshPrices`)
- Build Portfolio views: positions list, KPI cards, transaction history, analytics
- Test: add/edit/delete transactions, verify XIRR matches web app on same data

### Phase 2: Habits Module (1–2 weeks)
- Port streak algorithm to Swift with unit tests
- Build `HabitsStore` 
- Build Habits views: habit list, check-in, heatmap (custom Canvas drawing), streak display
- Add local notifications for habit reminders (WidgetKit home-screen widget is a bonus here)

### Phase 3: Ember Module (2–3 weeks)
- Port SM-2 spaced repetition to Swift with unit tests
- Build `EmberStore`
- Build Ember views: highlight shelf, review interface, source management
- Email: move your GitHub Actions email to a simple daily local notification instead (simpler on iOS)

### Phase 4: Settings + Polish (1 week)
- Settings screen: currency, theme, notification preferences, data export
- Dark/Light mode (SwiftUI handles 90% of this automatically)
- iPad-specific layout polish: NavigationSplitView, drag-and-drop

### Phase 5: Distribution
- TestFlight to family
- App Store submission (requires paid Developer account)

---

## 13. Critical Questions Back to You

Before starting Phase 0, I need your answer on a few things that will affect architectural decisions:

**On data:** Do you want to keep your existing web app running alongside the iOS app? If yes, you need the iOS app to also read/write your GitHub Gist so both stay in sync. This is doable but adds complexity. If no — if the iOS app eventually replaces the web app — then move fully to iCloud/CloudKit and drop Gist entirely.

**On monetization timeline:** You mentioned wanting to eventually monetize. "Super app with in-app purchases" (one App Store listing, pay to unlock modules) vs "three separate paid apps" have very different App Store strategies. It is worth deciding the direction before you design your IAP touchpoints.

**On sharing code between web and iOS:** There is no practical way to share business logic between vanilla JS and Swift. The algorithms get rewritten. This is the correct choice — the Swift versions will be typed, tested, and faster.

**On the email (Ember):** Your GitHub Actions email cron is clever but it is a server-side workaround for a browser limitation. On iOS, you have push notifications and local notifications. The daily Ember review prompt becomes a scheduled local notification — no GitHub Actions, no EmailJS, no secrets. Do you want to keep the email as a parallel channel or replace it with push notifications?

---

## Summary Table

| Question | Answer |
|---|---|
| iOS or iPadOS first? | Universal from day one. iPhone-first design, iPad adapts automatically. |
| Native UI framework? | SwiftUI. Mature on iOS 26. Correct choice. |
| Xcode UI playground? | SwiftUI Previews — live canvas in Xcode. Yes, it is excellent. |
| JS math → Swift? | Direct port. Same algorithms, same logic. Claude Code does the mechanical translation; you verify edge cases. |
| Data management? | SwiftData + iCloud/CloudKit. Replaces localStorage + Gist. One line of setup. |
| Super app vs 3 apps? | One app now, split later only if App Store strategy demands it. |
| Free vs paid libraries? | Swift Charts, SwiftData, CloudKit, WidgetKit — all free from Apple. Very little needs third-party. |
| App Store cost? | $99/year. Not needed until you share with family (use TestFlight). |
| Cowork vs Code? | Claude Code for all iOS development. Cowork for planning docs like this one. |
| Xcode + Claude integration? | Claude Code in terminal editing Swift files; Xcode open simultaneously building/previewing. |
