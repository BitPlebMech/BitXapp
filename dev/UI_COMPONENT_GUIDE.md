# Portfolio Terminal - UI Component Names Guide

**For non-technical users**: This guide shows you the exact name for every part of the interface so you can refer to them precisely when requesting changes.

---

## 📐 **Main Layout Structure**

```
┌─────────────────────────────────────────────────┐
│  TOPBAR (top horizontal bar)                    │
├──┬──────────────────────────────────────────────┤
│  │  TAB NAV (horizontal navigation)             │
│S │  ┌─────────────────────────────────────────┐│
│I │  │                                          ││
│D │  │  MAIN AREA (where content appears)       ││
│E │  │                                          ││
│B │  │                                          ││
│A │  └─────────────────────────────────────────┘│
│R │                                              │
└──┴──────────────────────────────────────────────┘
```

---

## 🔝 **TOPBAR** (Top Horizontal Bar)

**Location:** Very top of the screen

**What's in it:**

### Left Side:
- **Logo Icon** - The terminal/computer icon
- **App Title** - "BIT PLEB" text

### Right Side:
- **Theme Toggle Button** - Moon/sun icon (dark/light mode)

**How to refer to it:**
- "In the topbar..."
- "The theme button in the topbar..."

---

## 📱 **SIDEBAR** (Vertical Left Bar)

**Location:** Left edge of the screen (52px wide)

**What's in it (top to bottom):**

1. **Portfolio Icon** - Chart icon (currently active)
2. **Separator Line** - Thin horizontal line
3. **Habit Tracker Icon** - Checkmark icon (coming soon)
4. **Finance Calc Icon** - Document icon (coming soon)
5. **Return Compare Icon** - Bar chart icon (coming soon)
6. **Spacer** - Flexible empty space
7. **Gist Sync Icon** - GitHub icon at bottom
   - Has small **Unsaved Dot** (amber circle when changes not saved)

**Each icon has:**
- **Icon Button** - The clickable icon itself
- **Label** - Small text below icon
- **Tooltip** - Appears on hover

**How to refer to it:**
- "The sidebar Portfolio icon..."
- "The Gist Sync button in the sidebar..."
- "The unsaved dot on the Gist icon..."

---

## 📊 **MODULE HEADER** (Portfolio Status Bar)

**Location:** Right below the topbar, above the tabs

**Left Side:**
- **Status Dot** - Green/amber/red circle
- **Status Text** - "All prices live" or "Initialising..."
- **Price Source Badge** - Shows "Live" or "Simulated"

**Right Side:**
- **FX Pill** - Shows exchange rates (e.g., "FX: 1€ = $1.09 · ₹91.87")
  - Clock icon when loading
  - Green when working
  - Red when failed
- **Currency Selector** - Dropdown with "€ EUR", "$ USD", "₹ INR"
  - **Currency Label** - "Currency" text above dropdown
  - **Currency Dropdown** - The actual selector
- **Save to Gist Button** - Button with GitHub icon
  - Has **Unsaved Dot** (amber circle when changes not saved)
- **Refresh Button** - Button with circular arrows
- **Settings Button** - Gear icon (opens Settings panel)

**How to refer to it:**
- "The module header..."
- "The FX pill in the module header..."
- "The currency dropdown..."
- "The status dot..."

---

## 📑 **TAB NAV** (Horizontal Tab Navigation)

**Location:** Below module header, above main content

**Tabs available:**
1. **Overview Tab** - Grid icon
2. **Positions Tab** - Portfolio icon
3. **History Tab** - Trash/archive icon

**States:**
- **Active tab** - Bold, underlined, bright color
- **Inactive tab** - Gray, clickable

**How to refer to it:**
- "The tab navigation..."
- "The Overview tab..."
- "Switch to the Positions tab..."

---

## 📦 **MAIN AREA** (Content Area)

**Location:** Center area where content appears

**Contains different content based on active tab:**

---

### 🔹 **OVERVIEW TAB** Content

#### **KPI Grid** (Top Metrics Bar)
Shows 4 key metrics in a row:
- Total Value
- Total Gain
- CAGR
- XIRR

**Each KPI has:**
- **Label** - "Total Value", "Total Gain", etc.
- **Value** - The number
- **Subtext** - Additional info below

**How to refer to it:**
- "The KPI grid..."
- "The Total Value KPI..."
- "The CAGR metric in the KPI grid..."

---

#### **Allocation Panel** (Donut Charts)

**Panel header:**
- **Allocation Tabs** - "By Asset" and "By Class" tabs

**Content:**
- **Donut Chart** - Circular chart showing allocation
- **Donut Legend** - List of items with colors next to chart

**How to refer to it:**
- "The allocation panel..."
- "The donut chart..."
- "The allocation tabs (By Asset / By Class)..."
- "The donut legend..."

---

#### **Waterfall Chart Panel**
Shows cumulative gain/loss over time

**How to refer to it:**
- "The waterfall chart..."
- "The waterfall panel..."

---

### 🔹 **POSITIONS TAB** Content

#### **Position Grid**
Shows all your investments as cards

**Filter Buttons (top):**
- **All button**
- **Stock button**
- **ETF button**
- **Crypto button**

Each creates a different filter.

---

#### **Position Card** (Individual Investment Card)

**Visual structure:**
```
┌──────────────────────────────────────────────┐
│ ┃ COLORED BAR (left edge)                    │
│ ┃                                             │
│ ┃ [ICON] TICKER NAME                          │
│ ┃        Company Name                         │
│ ┃        Current Price                        │
│ ┃                                             │
│ ┃ METRICS (Shares, Avg Cost, Value, etc.)    │
│ ┃                                             │
│ ┃ ──────────────────────────────────────────  │
│ ┃ [Details] [+] [×]  (FOOTER BUTTONS)        │
└──────────────────────────────────────────────┘
```

**Parts of a Position Card:**

1. **Position Card Bar** - Colored vertical bar on left edge

2. **Position Card Header**
   - **Position Icon** - Circle with ticker initials
   - **Position Ticker** - Ticker symbol (e.g., "AAPL")
   - **Class Badge** - "stock", "etf", or "crypto" label
   - **Position Name** - Full company name
   - **Position Price** - Current price
   - **Price Timestamp** - "🟢 live·YF · 2m ago"

3. **Position Metrics** (middle section)
   - Multiple rows showing:
     - Shares
     - Avg Cost
     - Value
     - Unrealised P&L
     - Realised P&L (if any)
     - Returns (CAGR, XIRR, ABS)

4. **Position Card Footer**
   - **Details Button** - Magnifying glass icon
   - **Add Button** - Plus icon (add transaction)
   - **Delete Button** - X icon (delete position)

**How to refer to it:**
- "The position card for AAPL..."
- "The position card header..."
- "The position metrics section..."
- "The Details button in the position card footer..."
- "Remove the position card bar..."

---

### 🔹 **HISTORY TAB** Content

Shows transaction history table with columns:
- Date
- Ticker
- Type (BUY/SELL)
- Quantity
- Price
- Total
- Fees/Tax

**How to refer to it:**
- "The history tab..."
- "The transaction table..."

---

## 🎯 **MODAL** (Popup Window)

**Two types:**

### 1. **Add Transaction Modal**

**Opens when:** You click "+" button or "Add Transaction"

**Parts:**
- **Modal Overlay** - Dark semi-transparent background
- **Modal Window** - The white/dark box in center
  - **Modal Header**
    - **Modal Title** - "Add Transaction"
    - **Close Button (X)** - Top right corner
  - **Modal Body** - Form fields inside
    - Ticker input
    - Type selector (BUY/SELL)
    - Date picker
    - Quantity field
    - Price field
    - Fees field
    - Tax field
  - **Modal Footer** - Bottom section with buttons
    - Cancel button
    - Add button

**How to refer to it:**
- "The Add Transaction modal..."
- "The modal header..."
- "The ticker input in the modal..."
- "The modal footer buttons..."

---

### 2. **CSV Import Modal**

**Opens when:** You click "Import CSV"

**Similar structure to Add Transaction Modal:**
- Modal Header
- Modal Body (shows CSV preview)
- Modal Footer (import/cancel buttons)

**How to refer to it:**
- "The CSV import modal..."

---

## 📋 **DRAWER** (Bottom Sheet / Detail Panel)

**Opens when:** You click "Details" button on a position card

**Location:** Slides up from bottom of screen

**Visual structure:**
```
┌────────────────────────────────────────┐
│ ─── (HANDLE - drag to close)           │
├────────────────────────────────────────┤
│ [ICON] TICKER NAME                  [×]│
│        Full Name                        │
│        Pills (class badges)             │
├────────────────────────────────────────┤
│ KPI ROW (mini metrics)                  │
├────────────────────────────────────────┤
│ SUMMARY TEXT                            │
├────────────────────────────────────────┤
│ 📊 DUMBBELL CHART                       │
│    Buy Price vs Current Price            │
├────────────────────────────────────────┤
│ 📊 LOT DISTRIBUTION BAR                 │
├────────────────────────────────────────┤
│ 📋 TRANSACTION TABLE                    │
│    All transactions for this ticker      │
└────────────────────────────────────────┘
```

**Parts of the Drawer:**

1. **Drawer Overlay** - Dark background when drawer is open
2. **Drawer Handle** - Horizontal line at top (drag to close)
3. **Drawer Header**
   - **Drawer Icon** - Ticker initials in colored circle
   - **Drawer Ticker** - Ticker symbol
   - **Drawer Full Name** - Company full name
   - **Drawer Pills** - Class badges
   - **Drawer Close Button (×)** - Top right

4. **Drawer KPIs** - Row of mini metrics

5. **Drawer Summary** - Text description of position

6. **Dumbbell Chart Section**
   - **Chart Section Header**
     - **Chart Section Title** - "Buy Price vs. Current Price..."
     - **Chart Legend** - Color indicators
   - **Canvas** - The actual chart

7. **Lot Distribution Section**
   - **Lot Distribution Label**
   - **Lot Distribution Track** - Stacked bar
   - **Lot Distribution Legend** - Lot details

8. **Transaction Table**
   - Shows all transactions for this ticker
   - Same structure as History tab table

**How to refer to it:**
- "The drawer..."
- "The drawer header..."
- "The dumbbell chart in the drawer..."
- "The transaction table in the drawer..."
- "The lot distribution bar..."

---

## ⚙️ **SETTINGS PANEL** (Side Panel)

**Opens when:** You click the gear icon in module header

**Location:** Slides in from right side

**Parts:**

1. **Settings Panel Overlay** - Dark background
2. **Settings Panel** - The panel itself
   - **Settings Header**
     - Title "Settings"
     - Close button (×)
   
3. **Settings Sections** (multiple collapsible sections):

   ### **Theme Section**
   - Light/Dark theme toggle
   
   ### **Data Import/Export Section**
   - **Export Button** - Download data as JSON
   - **Import Button** - Upload JSON file
   - **CSV Import Button** - Import transactions from CSV
   
   ### **FX Rates Section**
   - **FX Chips** - Shows current rates
   - **FX Diagnostics Panel** (appears when API fails)
     - **Test API Now Button**
     - **Copy Debug Info Button**
     - **Diagnostic Content** - Error messages, cache status
   
   ### **Gist Sync Section**
   - Token input field
   - Gist ID input field
   - Save/Load/Clear buttons
   - **Gist Status** - Shows operation results
   
   ### **Sample Data Section**
   - **Reload Sample Data Button**

**How to refer to it:**
- "The Settings panel..."
- "The FX Rates section in Settings..."
- "The diagnostic panel in Settings..."
- "The Test API Now button in Settings..."
- "The Gist Sync section..."

---

## 🎨 **COMMON ELEMENTS**

### **Buttons**

**Types:**
- **Primary Button** - Filled with color (e.g., "Refresh")
- **Outline Button** - Border only (e.g., "Cancel")
- **Icon Button** - Icon only, no text (e.g., gear icon)
- **Danger Button** - Red colored (e.g., delete)

**How to refer to it:**
- "The primary button..."
- "The outline button..."
- "Change the Refresh button color..."

---

### **Badges**

Small colored labels:
- **Class Badge** - "stock", "etf", "crypto"
- **Type Badge** - "BUY", "SELL"
- **Status Badge** - "Live", "Simulated"

**How to refer to it:**
- "The class badge..."
- "The BUY/SELL badge..."

---

### **Pills**

Small rounded containers with text/icons:
- **FX Pill** - Shows exchange rates
- **Drawer Pills** - Class indicators

**How to refer to it:**
- "The FX pill..."

---

### **Dots / Indicators**

Small colored circles:
- **Status Dot** - Green/amber/red in module header
- **Unsaved Dot** - Amber circle on Gist icons
- **Legend Dot** - Color indicators in chart legends

**How to refer to it:**
- "The status dot..."
- "The unsaved indicator..."

---

## 📊 **CHARTS & VISUALIZATIONS**

### **Donut Chart**
- Circular allocation chart
- Has legend on the right

### **Waterfall Chart**
- Bar chart showing cumulative changes
- Bars separated by ticker

### **Dumbbell Chart**
- Shows buy vs. current price
- Dots connected by lines
- One row per lot

### **Lot Distribution Bar**
- Horizontal stacked bar
- Shows unit distribution

**How to refer to it:**
- "The donut chart..."
- "The waterfall chart..."
- "The dumbbell chart..."

---

## 📝 **FORM ELEMENTS**

### **Input Fields**
- **Text Input** - For ticker, quantity, etc.
- **Number Input** - For prices, fees
- **Date Picker** - For transaction date
- **Dropdown / Select** - For currency, type

**How to refer to it:**
- "The ticker input field..."
- "The date picker..."
- "The currency dropdown..."

---

## 🎯 **QUICK REFERENCE TABLE**

| UI Element | Location | Example Request |
|------------|----------|-----------------|
| **Topbar** | Very top | "Change topbar background color" |
| **Sidebar** | Left edge | "Make sidebar wider" |
| **Module Header** | Below topbar | "Hide the FX pill in module header" |
| **Tab Nav** | Below module header | "Change tab navigation style" |
| **KPI Grid** | Top of Overview | "Add another metric to KPI grid" |
| **Position Card** | In Positions tab | "Change position card layout" |
| **Position Card Footer** | Bottom of card | "Remove numbers from position card footer" |
| **Modal** | Popup center | "Change Add Transaction modal width" |
| **Drawer** | Bottom sheet | "Add chart to drawer" |
| **Settings Panel** | Right side panel | "Add new section to Settings" |
| **Donut Chart** | Overview tab | "Change donut chart colors" |
| **Dumbbell Chart** | In drawer | "Adjust dumbbell chart spacing" |

---

## 💡 **EXAMPLE REQUESTS**

### ✅ **GOOD** - Specific and clear:
- "In the **position card footer**, remove the numbers left of the Details button"
- "Change the **FX pill** color in the **module header** to blue"
- "Add a button to the **drawer header** next to the close button"
- "In the **Settings panel**, make the **diagnostic panel** always visible"
- "Change the **donut chart** size in the **Overview tab**"

### ❌ **UNCLEAR** - Too vague:
- "Change the header" → Which header? Topbar? Module header? Drawer header?
- "Fix the numbers" → Which numbers? Where?
- "Update the panel" → Which panel? Settings? Allocation? Diagnostic?

---

## 🎯 **SPECIAL SECTIONS**

### **Panels**
Generic containers with title and content:
- Always have **Panel Header** and **Panel Body**
- Used in Overview and Positions tabs

**How to refer to it:**
- "The allocation panel..."
- "Create a new panel in Overview tab..."

### **Sections**
Named groups in Settings or Drawer:
- **Settings Section** - Each collapsible area in Settings
- **Chart Section** - Dumbbell/waterfall chart containers
- **Lot Distribution Section** - In drawer

**How to refer to it:**
- "The Gist Sync section in Settings..."
- "The chart section in the drawer..."

---

## 🔍 **FINDING COMPONENTS**

**Not sure what something is called?**

1. **Describe its location:**
   - "The thing at the top-left corner..."
   - "The button next to the currency selector..."
   - "The chart in the drawer below the KPIs..."

2. **Describe its appearance:**
   - "The green circular dot..."
   - "The horizontal bar with tabs..."
   - "The popup window that appears when adding transactions..."

3. **Describe its function:**
   - "The button that opens position details..."
   - "The area showing exchange rates..."
   - "The chart that shows buy vs. current price..."

I'll help identify the correct component name!

---

## 📐 **NESTING STRUCTURE**

Understanding hierarchy helps you be more precise:

```
App
└── Topbar
└── Body Row
    ├── Sidebar
    │   └── Sidebar Icons
    │       ├── Icon Button
    │       ├── Label
    │       └── Tooltip
    │
    └── Main Area
        ├── Module Header
        │   ├── Left Side (status, badge)
        │   └── Right Side (FX, currency, buttons)
        │
        ├── Tab Nav
        │   └── Tab Buttons
        │
        └── Tab Content
            ├── Overview Tab
            │   ├── KPI Grid
            │   ├── Allocation Panel
            │   └── Waterfall Panel
            │
            ├── Positions Tab
            │   └── Position Cards
            │       ├── Card Header
            │       ├── Card Body (metrics)
            │       └── Card Footer (buttons)
            │
            └── History Tab
                └── Transaction Table

Overlays (slide in/popup):
├── Modal (Add Transaction, CSV Import)
├── Drawer (Position Details)
└── Settings Panel
```

**Example precise request:**
"In the **Positions Tab** → **Position Card** → **Card Footer**, remove the progress bar between the numbers and the buttons."

---

**Generated:** April 2026  
**Version:** BIT PLEB Portfolio Terminal v3.5  
**Purpose:** UI component naming reference for non-technical users
