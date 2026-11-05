# CartTrail

**Turn grocery receipts into a spending history.** Take a photo of a receipt, check the items against the printed subtotal, and see where your grocery money goes, month by month and store by store.

[Open the live app](https://grocery-tracker.hinkel-nicholas12.workers.dev/) · Accounts are invite-only for now, so ask whoever set up your CartTrail to add you.

![Walkthrough of CartTrail: the overview, scanning a receipt, fixing a misread price so the items match the printed $5.12 subtotal, confirming the store branch, saving, and the updated overview](docs/receipt-demo.gif)

## What you can do

- **Add a receipt in seconds.** Photograph it and CartTrail reads the store, date, items, quantities and prices for you. You can also type items in by hand.
- **Save in one tap.** When the items add up to the printed subtotal, the review collapses and the button says "Looks right, save receipt". You can also pick several photos at once and review them one after another.
- **Catch mistakes before they count.** Your items are added up and compared with the printed subtotal, live, as you edit. If they differ, you're told by how much, and you can fix the line right there.
- **See your month at a glance.** The overview shows your last 30 days, a spending-by-day chart, your latest receipt and where the money went.
- **See what this receipt changed.** Right after saving, you get a short read-out: how the trip compares with your usual at that store, the biggest price move, and anything you paid more for than at another store.
- **See what changed.** Plain-language notes point out categories and stores that are above your usual month, and what's gone up or down since the 30 days before.
- **Follow your trends.** Compare months over 3, 6 or 12 months, filter by store, watch **Price watch** for what's gone up or down, and see spending by category.
- **Find savings.** A savings finder lists items that cost less at another store and what switching could have saved.
- **Set a monthly budget.** See how you're tracking this month, how many days are left, and a warning if you're heading over.
- **Compare your stores.** See trips, average spend per trip and share of spending for each store, and which store charges more for the same item.
- **Know where you shop.** Pin a receipt to a store branch and see all your stores on a map, sized by what you spend there. CartTrail suggests the branch from the address on the receipt.
- **Take it with you.** Add CartTrail to your home screen for a one-tap "Scan a receipt" shortcut, and export everything to CSV any time.
- **Look around before you start.** A new account with no receipts sees clearly labelled sample data, so you can see what the app looks like with history. It disappears as soon as you save your first receipt.

CartTrail works on a phone as well as a desktop.

### Watch it

- [Full walkthrough with voiceover](docs/carttrail-promo.mp4) (49 seconds): quick upload, then trends, price watch, categories and the store map
- [15-second social cut](docs/carttrail-social-15s.mp4) (vertical, with voiceover and music)

Both were recorded from the app with sample data and a mocked backend. The map's street background in the videos is a stand-in, because map tiles couldn't be loaded when recording; the pins, labels and store list are the app's own.

### A few things worth knowing

- **Always check the scan.** Receipts are read by software and can be misread. Compare the items with your photo before saving.
- **Your data is private.** Receipts, items and saved branches are visible only to your account.
- **Some things leave the app.** Receipt photos are sent to Azure to be read, merchant addresses to the U.S. Census Geocoder (to suggest a branch), and store-name searches to Geoapify. Opening the map loads OpenStreetMap tiles.
- **Amounts are in U.S. dollars**, summed from saved line items.

---

# Technical documentation

## How it works

1. Upload a JPEG or PNG receipt (up to 4 MB). The `hyper-handler` Supabase Edge Function verifies your session and sends the image to Azure Document Intelligence.
2. Review the extracted store, date, quantities and prices. The form compares the entered line totals with the scanned subtotal when available.
3. Save the reviewed receipt and its items to PostgreSQL in one transaction, through a database function. Supabase row-level security limits access to the receipt owner.

The frontend is React and Vite, hosted on Cloudflare Workers. Monthly spending sums saved line amounts and displays them in USD.

## Run locally

```bash
npm ci
npm run dev
```

Create `.env.local` in the project root with your Supabase project URL and publishable key.

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Starts the Vite development server. |
| `npm run build` | Builds the frontend for deployment. |
| `npm run preview` | Serves the production build locally. |
| `npm run lint` | Checks the source with Oxlint. |

## Backend setup

For your own backend, configure Supabase Auth, the `receipts` and `receipt_items` tables with ownership policies, and the `save_grocery_receipt` database function. Create a test user in Supabase and deploy the [`hyper-handler` Edge Function](supabase/functions/hyper-handler/index.ts). Set `AZURE_DOCUMENT_ENDPOINT` and `AZURE_DOCUMENT_KEY` in Supabase Edge Function secrets.

Sign in with Google needs an OAuth client configured in Google Cloud and enabled as a provider in Supabase Auth. Email and password sign-in works without it.

### Database migrations

Apply these in order. The app detects missing migrations and degrades gracefully, for example by disabling the map until the location columns exist.

| Migration | Adds |
| --- | --- |
| [`20261105000000_remember_receipt_categories.sql`](supabase/migrations/20261105000000_remember_receipt_categories.sql) | Item categories and remembered category rules per store and item name. |
| [`20261105010000_receipt_locations.sql`](supabase/migrations/20261105010000_receipt_locations.sql) | Coordinates on receipts, which enable the spending map. |
| [`20261105020000_saved_store_branches.sql`](supabase/migrations/20261105020000_saved_store_branches.sql) | Saved store branches and the `save_grocery_receipt_at_branch` function. Apply after the two above, and redeploy `hyper-handler`. |
| [`20261105030000_monthly_budget.sql`](supabase/migrations/20261105030000_monthly_budget.sql) | The `grocery_budgets` table (one monthly budget per user, with row-level security). Until it is applied, the budget panel is simply hidden. |

## Reading the printed subtotal

Azure's receipt model often leaves its `Subtotal` field empty for grocery receipts such as H-E-B's, so [`hyper-handler`](supabase/functions/hyper-handler/index.ts) picks the subtotal in this order (see [`subtotal.ts`](supabase/functions/hyper-handler/subtotal.ts)):

1. Azure's own `Subtotal` field.
2. The amount printed after a `SUBTOTAL` label in the receipt text, on the same line or the next one. Amounts printed before the label are ignored.
3. Total minus tax, but only when Azure read both.

The response includes `subtotalSource` (`azure`, `text` or `total-minus-tax`) to help debug a receipt. If none of these finds a subtotal, the review screen asks the user to type it in, so the subtotal check still works. Redeploy the function after changing it (`supabase functions deploy hyper-handler`).

## Trends and the spending map

Trends charts show monthly spending, product prices per recorded unit, and category spending. Period and store filters apply to the charts, rankings and map. **Price watch** compares each product's latest per-unit price with its price three months earlier, and uses the store filter but not the period filter. The figures come from saved receipt lines in USD.

The map needs the receipt locations migration. Choose a saved receipt and pin its store branch manually, or let a suggested branch be saved with the receipt. Branches with the same saved coordinates are grouped. Opening the map loads the OpenStreetMap basemap through Leaflet.

## Insights

The overview's **What changed** list is computed in [`src/insights.js`](src/insights.js) from saved receipts, with no extra storage:

- **Windows.** Receipts are grouped into 30-day windows counted back from today. "Usual" is the average of up to three earlier windows, and only windows your history fully covers count. If you have less history than that, the "above your usual" notes simply don't appear.
- **Above your usual.** A category or store is flagged when the last 30 days are at least 25% and at least $10 above its usual amount. Uncategorized and Non-grocery are never flagged.
- **Against the 30 days before.** The biggest rise and the biggest drop among categories are shown when they move by at least $5 and 15%. A drop is only reported if something was still spent.
- **Stores on Trends.** The store table follows the period filter but ignores the store filter, so stores stay comparable. "Same item, different store" compares per-unit prices for items whose names match exactly at two or more stores. It shows gaps of 10% to 150% with at least $0.20 of extra spending, since larger gaps are usually different pack sizes.

### After saving, savings, and unlocking

- **What this receipt changed** is computed by `receiptImpact` in `src/insights.js` from the history that existed before the receipt was saved: the trip against the average at that store (two or more earlier trips needed), the biggest per-unit price move of 10% and $0.20 or more against the last purchase, an item that cost 10% to 150% less at another store, and the month so far. The first receipt gets a welcome note instead.
- **Unlock progress.** The "above your usual" notes need two months of history, so the overview shows how many of those 60 days are covered. Scanning older receipts counts toward it.
- **Savings finder** (`savingsEstimate`) uses the last 90 days of receipts and the same like-for-like name matching as the store comparison. It only appears when the estimated saving is $3 a month or more.
- **Budget.** A single monthly total per user, stored in `grocery_budgets`. The panel shows spend this calendar month, what is left, and a projection (from day 7) of where the month will end.

## Installing and exporting

- **Home screen.** `public/manifest.json` and a small service worker make the app installable. The service worker caches nothing, so users never see a stale version. The installed app has a "Scan a receipt" shortcut that opens `/?scan=1` straight to the capture screen. Icons are in `public/`.
- **CSV export.** The Receipts page exports every item (date, store, item, quantity, line total, category) from the receipts already loaded in the browser. Text cells that start with a formula character are prefixed so spreadsheets don't run them.

## Suggested receipt branches

Apply the saved store branches migration and redeploy `hyper-handler`. The scan returns Azure's merchant address. A previously confirmed branch is reused; unfamiliar U.S. addresses are looked up through the U.S. Census Geocoder and require confirmation before being saved as a branch.

The Census lookup needs no API key and returns approximate coordinates. Choosing a saved branch or skipping location remains available when an address is missing, outside the U.S., ambiguous, or unavailable. New address lookups send the merchant address to Census. Store branches and links are private to each account.

To enable store-name search, add a Geoapify key as `GEOAPIFY_API_KEY` in Supabase Edge Function secrets and deploy the updated `hyper-handler`. Search accepts a store name plus a city, street or ZIP code. Select the correct result before saving. Search sends the query text to Geoapify.

## Sample data

When an account has no saved receipts, the overview, Receipts and Trends pages render a built-in dataset from [`src/sampleData.js`](src/sampleData.js) with a banner saying so. It is generated relative to today's date, exists only in the browser, and is never written to Supabase. Editing and map pinning are disabled for sample receipts, and the scan form lists only real receipts. The app switches to real data as soon as the first receipt is saved.

## Project structure

| Path | Contents |
| --- | --- |
| `src/App.jsx` | Session handling, receipt loading, scan and save flow, and the Receipts and review screens. |
| `src/Overview.jsx` | Overview: 30-day total, spending by day, latest receipt, recent receipts and categories. |
| `src/Trends.jsx`, `src/TrendChart.jsx` | Trends page, filters, Price watch and the interactive history charts. |
| `src/SpendingMap.jsx`, `src/PlaceSearch.jsx` | Leaflet map, branch list, pinning, and store-name search. |
| `src/SignIn.jsx` | Email and Google sign-in. |
| `src/ui.jsx` | Shared pieces: icons, logo, the `ReceiptPaper` component and placeholder shapes. |
| `src/categories.js`, `src/format.js`, `src/sampleData.js` | Category matching, formatting helpers and the sample dataset. |
| `src/styles/` | Design tokens (`tokens.css`) and application styles (`app.css`). |
| `supabase/functions/hyper-handler/` | Edge Function for scanning, address lookup and store search. |
| `supabase/migrations/` | SQL migrations. |
| `docs/` | README media. |

## Design notes

The interface follows a restrained visual system: a white-paper receipt as the one signature element, tables for tabular data, sentence-case copy, no gradients, glow or scroll-triggered effects. Motion is limited to state changes and first paint, and is disabled under `prefers-reduced-motion`. Focus rings are always visible and text meets a 4.5:1 contrast ratio.

## Components and services

| Component | Role in CartTrail |
| --- | --- |
| [React](https://react.dev/) | Renders the receipt review form, purchase history, spending dashboard, and trends. |
| [Vite](https://vite.dev/) and [npm](https://www.npmjs.com/) | Install dependencies, run the local development server, and build the frontend for deployment. |
| [GitHub](https://github.com/completrz/Grocery-Tracker) | Stores the source code, documentation, and database migrations. The `main` branch is the deployment source. |
| [Cloudflare Workers](https://workers.cloudflare.com/) | Builds and hosts the frontend from GitHub. |
| [Supabase](https://supabase.com/) and [PostgreSQL](https://www.postgresql.org/) | Handle sign-in and store receipts, line items, and saved store branches. Row-level security scopes records to their owner. The frontend connects through `supabase-js`, and the `hyper-handler` Edge Function calls the scanning and location services. |
| [Google Cloud](https://console.cloud.google.com/) | Provides the OAuth client for Sign in with Google through Supabase Auth. |
| [Azure AI Document Intelligence](https://azure.microsoft.com/en-us/products/ai-services/ai-document-intelligence) | Extracts the merchant, purchase date, line items, prices, and subtotal from receipt images when available. |
| [U.S. Census Geocoder](https://geocoding.geo.census.gov/) | Looks up approximate coordinates for unfamiliar U.S. merchant addresses. |
| [Geoapify](https://www.geoapify.com/) | Powers optional store-branch search by store name and location. |
| [Leaflet](https://leafletjs.com/) and [OpenStreetMap](https://www.openstreetmap.org/) | Render the interactive spending map and supply its basemap, respectively. |
| [Oxlint](https://oxc.rs/docs/guide/usage/linter.html) | Checks the source code via `npm run lint`. |

See [`package.json`](package.json) for the full dependency list.
