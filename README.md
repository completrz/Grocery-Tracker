# CartTrail

**Turn grocery receipts into a spending history.** Take a photo of a receipt, check the items against the printed subtotal, and see where your grocery money goes, month by month and store by store.

[Open the live app](https://carttrail.app/) · Accounts are invite-only for now, so ask whoever set up your CartTrail to add you.

![Walkthrough of CartTrail: the overview, scanning a receipt, fixing a misread price so the items match the printed $5.12 subtotal, confirming the store branch, saving, and the updated overview](docs/receipt-demo.gif)

## What you can do

- **Add a receipt in seconds.** Photograph it, or upload a screenshot or PDF of a digital receipt, and CartTrail reads the store, date, items, quantities and prices for you. On a computer you can drop a file onto the scan screen or paste a screenshot. You can also type items in by hand.
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
- **Share receipts straight in.** On Android, once CartTrail is installed, it appears in the Share menu: share a screenshot or PDF from Photos, Gmail or Files and it opens ready to review.
- **Take it with you.** Install CartTrail on your home screen for a one-tap "Scan a receipt" shortcut, turn on notifications (a weekly summary, budget alerts and a nudge when you've gone quiet, each optional), and export everything to CSV any time.
- **Make it yours.** A Profile page (the circle at the top right) holds your name and picture, password, budget, time zone, notifications, install button, CSV export, and options to delete your data or your whole account.
- **Enjoy the details.** Saving a receipt prints it, with a CHECKED stamp when the items matched the printed subtotal and a line at the foot like a store's (with milestones at your 1st, 5th, 10th, 25th receipt and beyond). Your week or month can be printed as a receipt picture to save or share. Price changes are shelf tags, categories are aisles, and there's an optional printer sound, an optional buzz on phones, and a playful tone for the notes.
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
# Optional: enables the notifications panel (see Push notifications below)
VITE_VAPID_PUBLIC_KEY=your-vapid-public-key
# Optional: the notifier function's name, if it isn't `notify`
VITE_NOTIFY_FUNCTION=notify
# Shown on the public privacy, terms and support pages
VITE_CONTACT_EMAIL=you@example.com
VITE_OPERATOR_NAME=Your name or company
# The deletion function's name, if it isn't `delete-account`
VITE_DELETE_FUNCTION=delete-account
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
| [`20261105050000_profiles.sql`](supabase/migrations/20261105050000_profiles.sql) | `profiles` (display name and avatar path, private to the user) and the private `avatars` storage bucket with per-user access rules. Until it is applied, the name and picture options are hidden. |
| [`20261105040000_push_notifications.sql`](supabase/migrations/20261105040000_push_notifications.sql) | `push_subscriptions` (one row per device, endpoints limited to known push services), `notification_settings` (the user's choices and time zone) and `notification_log` (what was already sent; server only). Until it is applied, the notifications panel is hidden. |
| [`20261106000000_manage_receipts.sql`](supabase/migrations/20261106000000_manage_receipts.sql) | Editing and deleting saved receipts from receipt history. |

## Reading the printed subtotal

Azure's receipt model often leaves its `Subtotal` field empty for grocery receipts, and H-E-B receipts print no `SUBTOTAL` line at all, only `Total Sale` and the amount. So [`hyper-handler`](supabase/functions/hyper-handler/index.ts) picks the subtotal in this order (the logic sits at the top of the same file, so the function can be pasted into the Supabase dashboard as a single file):

1. Azure's own `Subtotal` field.
2. The amount printed after a `SUBTOTAL` label in the receipt text, on the same line or the next one. Amounts printed before the label are ignored.
3. The receipt's total (Azure's `Total` field, or the amount after a `Total`, `Total Sale`, `Amount Due` or `Balance Due` label) minus any tax (Azure's `TotalTax`, or amounts on `TAX` lines). Labels with extra words, such as `TOTAL SAVINGS`, are not totals.

The response includes `subtotalSource` (`azure`, `text`, `total` or `total-minus-tax`) to help debug a receipt. When the subtotal was worked back from the total, the review screen shows it in an editable "Printed subtotal" field with a note, so the user can correct it. If nothing is found, the field is empty and the user can type it in, so the check still works. Redeploy the function after changing it (`supabase functions deploy hyper-handler`, or paste `index.ts` into the dashboard editor).

### Scans that stall

The scanner never leaves the app waiting forever:

- **The function** puts a deadline on each step that has no limit of its own: 10 seconds for the sign-in check and 20 for reading the upload (Azure's calls already stop at 45 seconds). A step that stalls returns a 504 saying which one, and the reason is written to the function's logs.
- **The log** also marks each stage (`scan: signed in`, `file received`, `Azure answered the upload with 202`, `Azure is still running`, `Azure finished`), so a stuck scan shows where it stopped.
- **The app** stops waiting after 70 seconds (`VITE_SCAN_TIMEOUT_MS` changes it, for testing), says "That took too long", and offers **Try this file again**. The same button appears after any failed scan.

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

## Profile and account

The circle at the top right opens the Profile page (`src/Profile.jsx`):

- **Account:** an optional display name (up to 60 characters), a picture, the email and sign-in method, change password (email sign-ins only) and sign out. Pictures are cropped to a 256 px square and re-encoded as JPEG in the browser before upload, which also removes any EXIF or location data. They are stored in the private `avatars` bucket at `<user id>/avatar.jpg` and shown through a one-hour signed link.
- **Preferences:** the monthly budget and the time zone used for notification times.
- **Notifications and install:** the cards described below.
- **Your data:** a summary, CSV export, and two deletion options.
- **Forgot password:** the sign-in page sends a reset email; following the link signs the user in and opens the Profile with the change-password form open. Set the Site URL and Redirect URLs under Authentication, URL Configuration in Supabase to the live site, or reset links will point to the wrong place.

### Deleting data and accounts

[`delete-account`](supabase/functions/delete-account/index.ts) is a single-file Edge Function (deploy it with **Verify JWT** off; it authenticates the caller itself). It takes `{ "scope": "data" | "account", "confirm": "DELETE" }`:

- `data` removes the user's receipts, items, saved store branches, remembered categories and budget, and keeps the account.
- `account` also removes the profile, avatar, notification settings, devices and log, and finally the sign-in itself.

The caller must have signed in within the last 30 minutes, so the app asks email users for their password first (which refreshes that), and Google users who signed in a while ago are told to sign out and back in. Required tables are emptied first and any failure stops before the sign-in is touched, so a failed deletion can simply be retried. Tables from optional migrations that were never applied are skipped. The Profile calls the function named by `VITE_DELETE_FUNCTION` (default `delete-account`), because the dashboard editor names new functions at random.

### Public pages

The privacy policy (`/privacy/`), terms (`/terms/`), support (`/support/`) and how-to-delete (`/delete-account/`) pages are plain static pages, written in [`legal/`](legal) and built by [`vite-legal.js`](vite-legal.js). They work without signing in or running any script, which the app stores and search engines need, and every page links to the others. Set these at build time (Cloudflare build variables, or `.env.local`):

- `VITE_CONTACT_EMAIL`: the address shown on all four pages. Until it is set the pages say "[contact email not set]" and the build prints a warning.
- `VITE_OPERATOR_NAME`: who runs the service (default "the CartTrail operator").

The text describes what the app does today. Read it and adjust it (the 30-day promise for email requests, the age statement, governing law) before relying on it, and have a lawyer review it if you publish the app widely. Update `legal/meta.json` when you change them.

## Personality

CartTrail's character lives in receipts, shelf tags and words, not in extra colours, gradients or constant animation. All motion is switched off under `prefers-reduced-motion`.

- **Printing a receipt on save.** After a receipt is saved, the Saved screen prints it with `ReceiptPaper` (`src/ui.jsx`). The **CHECKED** stamp only appears when the items matched the printed subtotal at save time. The foot lines come from `receiptFooter` in `src/delight.js`: `ITEMS PURCHASED: n`, then a milestone line at receipt 1, 5, 10, 25, 50, 100, 250 and 500, otherwise a rotating thank-you.
- **Your week or month as a receipt.** `src/summary.js` totals the last 7 days (or the month so far) by category, and `src/receiptImage.js` draws it on a canvas as an 832 px wide PNG with a highlighted subtotal, a barcode and a torn edge. It shows totals and category names only (no stores, no items), and the picture's alt text says the same in words. "Save image" downloads it; "Share" appears where the browser can share files.
- **Shelf tags and aisles.** Every chip is shaped like a price tag, and categories carry "Aisle n" signs ranked by spend.
- **Greeting.** The overview opens with "Good morning, Sam." using the Profile name.
- **Printing loader.** While data loads, a receipt prints its lines one by one (`LoadingReceipt`).
- **Little touches** (Profile, remembered on that device only, in local storage): a printer sound and a buzz when saving, both off by default and played from the save click so browsers allow them, plus a tone choice. The **playful** tone adds a short, kind aside to insight rows (for example "Your wallet noticed before you did.") and to the receipt picture's comparison line. The asides are written in `withQuip` in `src/insights.js`.

## Installing the app

`public/manifest.json`, the icons and a small service worker make CartTrail installable. The **Profile** page shows an **Install CartTrail** button where the browser allows it (Chrome and Edge), and the steps for iPhone (Share, then Add to Home Screen) and other browsers. The installed app has a "Scan a receipt" shortcut that opens `/?scan=1` straight to the capture screen. The service worker caches nothing, so users never see a stale version.

### Getting receipts in without the camera

- **Files and paste.** The scan screen accepts JPEG, PNG and PDF files up to 4 MB, from the pickers, by drag and drop onto the screen, or by pasting a screenshot (Ctrl+V or Cmd+V). All routes go through one function in `src/App.jsx`. PDFs are read by Azure like photos; the review screen shows a "Your PDF receipt" card with a link to open the PDF, because browsers can't preview PDFs inline on phones. `hyper-handler` must be redeployed for PDFs to work, since it is where file types are checked.
- **Share target (Android).** `manifest.json` declares a `share_target` that posts files to `/share-target`. The service worker handles that request: it keeps up to 10 allowed files (JPEG, PNG or PDF, 4 MB each) in the browser cache, then redirects to the app. When the app opens it takes the files out of the cache (each is removed as it is read, and anything older than a day is dropped), opens the scan screen and scans them one after another. Nothing is ever saved without the user reviewing it. iPhone doesn't support share targets for installed web apps, so iPhone users use the upload button.

## Push notifications

Users turn notifications on from their Profile. They can choose three kinds and turn each off:

- **Weekly summary:** Sunday at 10am local time, what was spent in the last 7 days against the 7 before.
- **Budget alerts:** once at 80% and once at 100% of the monthly budget, each at most once a month.
- **Reminders:** when it has been longer than the user's usual rhythm (one and a half times their typical gap between receipts, at least 7 days, or 10 days with little history) since the last receipt, at most once a week, and never after 45 days of silence.

Everything is sent at 10am in the user's own time zone (saved when they turn notifications on), at most two messages per run, and nothing is sent twice (`notification_log`). Tapping a notification only ever opens a page on this site.

### Setup

1. Generate a VAPID key pair: `npx web-push generate-vapid-keys`. Keep the private key secret.
2. Give the **public** key to the frontend as `VITE_VAPID_PUBLIC_KEY`, in `.env.local` and as a build variable in Cloudflare. Without it the notifications panel stays hidden.
3. In Supabase, add Edge Function secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (for example `mailto:you@example.com`) and `CRON_SECRET` (a long random string).
4. Apply the push notifications migration.
5. Deploy [`notify`](supabase/functions/notify/index.ts) (a single file, so it can be pasted into the dashboard editor). The editor names new functions at random, so note the name it gives; if it isn't `notify`, set the build variable `VITE_NOTIFY_FUNCTION` to that name and use it in the cron URL below. Then open the function's settings and switch **Verify JWT** off. The function checks for itself: the hourly job must send `CRON_SECRET`, and the test button needs a valid signed-in user. (Projects on Supabase's newer publishable keys can't pass the gateway's JWT check with those keys, which is why the check is off.)
6. Enable the `pg_cron` and `pg_net` extensions (Database, Extensions) and schedule the job to run every hour, filling in your project reference and `CRON_SECRET`:

```sql
select cron.schedule('carttrail-notify', '0 * * * *', $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'YOUR-CRON-SECRET'
    ),
    body := '{"action":"run"}'::jsonb
  );
$$);
```

The job runs hourly because each user is only handled at their own 10am. `notify` also accepts `{"action":"test"}` from a signed-in user, which powers the "Send a test notification" button. On iPhone, notifications only work once CartTrail has been added to the home screen. A subscription the push service reports as gone (HTTP 404 or 410) is deleted automatically. The function refuses to contact any address that is not a known push service (Google, Mozilla, Apple or Windows).

## Exporting

The Receipts page exports every item (date, store, item, quantity, line total, category) to CSV from the receipts already loaded in the browser. Text cells that start with a formula character are prefixed so spreadsheets don't run them.

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
| `src/SignIn.jsx` | Email and Google sign-in, and password reset. |
| `src/Profile.jsx` | The Profile page: account, preferences, little touches, data export and deletion. |
| `src/delight.js`, `src/summary.js`, `src/receiptImage.js`, `src/ShareReceipt.jsx` | Preferences, sound and buzz, greetings and receipt footers; the week and month totals; the canvas that draws the shareable receipt; and its panel on the overview. |
| `legal/`, `vite-legal.js` | The public privacy, terms, support and deletion pages and the build step that renders them. |
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

## The public landing page

People who aren't signed in see a landing page at the site address: what the app does, a 15 second video, screenshots of each feature, how to install it to a phone's home screen (no app store), a short privacy section, and the sign-in form. It lives in `src/Landing.jsx` and `src/styles/landing.css`, and its pictures and video are in `public/promo/`. It is its own chunk, so signed-in users never download it.

- **Who sees it:** anyone signed out, except people in the middle of signing in (a Google or password-reset redirect, the share target) and browsers that have signed in before, which go straight to the sign-in screen. `/?about` always opens the landing page, and the sign-in screen links to it ("What is CartTrail?").
- **Opening sign-ups:** by default the page and sign-in screen say accounts are invite-only. When new people may create accounts, set `VITE_SIGNUPS_OPEN=true` as a Cloudflare build variable (redeploy), and make sure **Authentication → Sign In / Providers → Allow new users to sign up** is on in Supabase and Google is configured as a provider. The wording then changes to "Get started free" and "Continue with Google".
- **Updating the pictures and video:** replace the files in `public/promo/` (`hero`, `scan`, `checked`, `changed`, `trends`, `prices`, `savings`, `map`, `budget` and `week` as 780x1688 `.webp`; `carttrail-15s.mp4`; `poster.jpg`). The link preview shown when the site is shared is `public/og.png` (1200x630), with its tags in `index.html`. The public address used on shared receipts and in the install steps is `SITE_HOST` in `src/shared.js`.
