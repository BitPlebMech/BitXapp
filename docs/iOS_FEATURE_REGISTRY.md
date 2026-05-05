# BiT PleB — Feature Registry
> Cross-platform feature tracking: Web App ↔ iOS App  
> Maintained by: Claude Cowork (planning) + Claude Code (implementation status)  
> Last updated: May 2026 | Source: scanned from /DashBoard/js/modules/

Status legend: ✅ Done | 🔄 In progress | 📋 Planned (phase) | ❌ Not planned

---

## Portfolio Module

| Feature | Web App | iOS App | Notes |
|---|---|---|---|
| Add transaction | ✅ | 📋 Phase 2 | |
| Edit transaction | ✅ | 📋 Phase 2 | |
| Delete transaction | ✅ | 📋 Phase 2 | |
| Undo delete | ✅ | 📋 Phase 3 | |
| FIFO lot matching | ✅ | 📋 Phase 2 | Unit test required vs web output |
| XIRR (Newton-Raphson) | ✅ | 📋 Phase 2 | 7 seeds, 300 iter — port exact |
| CAGR (≥1yr guard) | ✅ | 📋 Phase 2 | |
| Position summary | ✅ | 📋 Phase 2 | |
| FX rates (ECB/frankfurter) | ✅ | 📋 Phase 2 | URLSession replaces fetch() |
| Live prices (CoinGecko/Yahoo/AV) | ✅ | 📋 Phase 2 | Same fallback chain |
| Price cache (4hr TTL) | ✅ | 📋 Phase 2 | |
| Multi-currency (EUR/USD/INR) | ✅ | 📋 Phase 2 | |
| Overview screen | ✅ | 📋 Phase 1 (static) → Phase 2 (live) | |
| Positions list | ✅ | 📋 Phase 1 (static) → Phase 2 (live) | |
| Position detail + lots | ✅ | 📋 Phase 1 (static) → Phase 2 (live) | |
| Analytics / charts | ✅ | 📋 Phase 1 (static) → Phase 2 (live) | Swift Charts replaces Chart.js |
| Asset class badges | ✅ | 📋 Phase 1 (design) → Phase 2 (logic) | |
| CSV import | ✅ | 📋 Phase 3 | |
| JSON export/import | ✅ | 📋 Phase 3 | |
| Ticker rename | ✅ | 📋 Phase 3 | |
| Gist sync (portfolio-data.json) | ✅ | 📋 Phase 2 | FORMAT COMPATIBILITY REQUIRED |

## Habits Module

| Feature | Web App | iOS App | Notes |
|---|---|---|---|
| Add habit | ✅ | 📋 Phase 2 | |
| Edit habit | ✅ | 📋 Phase 2 | |
| Archive habit | ✅ | 📋 Phase 2 | |
| Delete habit | ✅ | 📋 Phase 2 | |
| Daily check-in toggle | ✅ | 📋 Phase 2 | Haptic feedback on iOS |
| Current streak | ✅ | 📋 Phase 2 | Port getStreakInfo() exactly |
| Longest streak | ✅ | 📋 Phase 2 | |
| 7-day completion rate | ✅ | 📋 Phase 2 | |
| 28-day heatmap data | ✅ | 📋 Phase 2 | Custom Canvas drawing in SwiftUI |
| Habit icon (emoji) | ✅ | 📋 Phase 2 | |
| Habit color | ✅ | 📋 Phase 2 | |
| Habits list screen | ✅ | 📋 Phase 1 (static) → Phase 2 (live) | |
| Habit detail screen | ✅ | 📋 Phase 1 (static) → Phase 2 (live) | |
| Local notifications (reminders) | ❌ | 📋 Phase 3 | iOS-only new feature |
| Home screen widget (streak) | ❌ | 📋 Phase 4 | iOS-only new feature |
| JSON export/import | ✅ | 📋 Phase 3 | |
| Gist sync (habits-data.json) | ✅ | 📋 Phase 2 | FORMAT COMPATIBILITY REQUIRED |

## Ember Module

| Feature | Web App | iOS App | Notes |
|---|---|---|---|
| Add source (book) | ✅ | 📋 Phase 2 | |
| Delete source | ✅ | 📋 Phase 2 | |
| Add highlight | ✅ | 📋 Phase 2 | |
| Delete highlight | ✅ | 📋 Phase 2 | |
| Kindle import | ✅ | 📋 Phase 3 | File picker on iOS (DocumentPicker) |
| Daily review | ✅ | 📋 Phase 2 | Date-seeded shuffle — port exactly |
| SM-2 spaced repetition | ✅ | 📋 Phase 2 | Port _computeSM2() with unit tests |
| Review queue | ✅ | 📋 Phase 2 | |
| Review streak | ✅ | 📋 Phase 3 | |
| Book categorization | ✅ | 📋 Phase 3 | |
| Email daily digest | ✅ | 📋 Phase 3 (push notification) | Email kept on web; push notification added on iOS |
| Stats screen | ✅ | 📋 Phase 3 | |
| Quotes sub-feature | ✅ | 📋 Phase 4 | |
| Book shelf screen | ✅ | 📋 Phase 1 (static) → Phase 2 (live) | |
| Highlight list screen | ✅ | 📋 Phase 1 (static) → Phase 2 (live) | |
| Review interface screen | ✅ | 📋 Phase 1 (static) → Phase 2 (live) | |
| Gist sync (ember-highlights.json) | ✅ | 📋 Phase 2 | FORMAT COMPATIBILITY REQUIRED |

## App Shell / Settings

| Feature | Web App | iOS App | Notes |
|---|---|---|---|
| Sidebar navigation | ✅ fixed sidebar | 📋 Phase 0 | TabView(.sidebarAdaptable) — automatic |
| Dark / light theme | ✅ manual toggle | 📋 Phase 0 | Automatic via system preference |
| Theme toggle button | ✅ | ❌ Not planned | System preference handles this on iOS |
| Gist credentials entry | ✅ modal popup | 📋 Phase 2 | Settings Form section |
| Sign in / sign out | ✅ | 📋 Phase 2 | |
| Demo mode | ✅ | 📋 Phase 3 | |
| Currency preference | ✅ | 📋 Phase 2 | |
| Settings screen | ✅ | 📋 Phase 1 (static) → Phase 2 (live) | SwiftUI Form — native look |

## iOS-Only New Features (No Web Equivalent)

| Feature | Phase | Notes |
|---|---|---|
| Habit reminder notifications | Phase 3 | UserNotifications framework |
| Habit streak widget (home screen) | Phase 4 | WidgetKit |
| Portfolio value widget (home screen) | Phase 4 | WidgetKit |
| Face ID / Touch ID app lock | Phase 4 | LocalAuthentication |
| Push notification (Ember review) | Phase 3 | Replaces email on iOS |
| Swipe gestures (check-in, delete) | Phase 2 | .swipeActions in List |
| Haptic feedback (check-in, errors) | Phase 2 | .sensoryFeedback modifier |
| Share sheet (export) | Phase 3 | ShareLink SwiftUI component |
