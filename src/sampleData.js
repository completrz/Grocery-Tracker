// Sample receipts shown to accounts with no saved receipts, so the app looks the way it
// will once they start scanning. They live only in the browser: nothing here is written to
// Supabase, and the app swaps to real data as soon as the first receipt is saved.

const STORES = {
  heb: { name: 'H-E-B', latitude: 30.2395, longitude: -97.7547 },
  tj: { name: 'Trader Joe’s', latitude: 30.3077, longitude: -97.7431 },
  wf: { name: 'Whole Foods', latitude: 30.2705, longitude: -97.7541 },
  costco: { name: 'Costco', latitude: 30.2281, longitude: -97.7233 },
}

// [name, quantity, cents]. Categories come from the app's normal name matching.
const PLAN = [
  { ago: 2, store: 'heb', items: [['Bananas', 2.36, 127], ['Roma tomatoes', 1, 101], ['Jalapeno peppers', 1, 38], ['H-E-B bolillo 6ct', 1, 246]] },
  { ago: 6, store: 'tj', items: [['Whole milk', 1, 349], ['Large eggs', 1, 318], ['Chicken thighs', 1, 1450], ['Spinach', 1, 299], ['Cheddar cheese', 1, 499]] },
  { ago: 11, store: 'heb', items: [['Bananas', 1.8, 97], ['Ground beef', 1, 1189], ['Pasta', 2, 298], ['Whole milk', 1, 349], ['Apples', 3, 447]] },
  { ago: 16, store: 'wf', items: [['Sourdough bread', 1, 689], ['Avocados', 4, 596], ['Salmon fillet', 1, 1840], ['Sparkling water', 1, 799]] },
  { ago: 21, store: 'costco', items: [['Rotisserie chicken', 1, 499], ['Paper towels', 1, 2299], ['Eggs', 1, 599], ['Butter', 1, 1099]] },
  { ago: 27, store: 'heb', items: [['Whole milk', 1, 339], ['Bananas', 2.1, 113], ['Tortillas', 1, 248], ['Black beans', 3, 327], ['Coffee', 1, 1099]] },
  { ago: 33, store: 'tj', items: [['Large eggs', 1, 329], ['Yogurt', 2, 458], ['Broccoli', 1, 249], ['Bacon', 1, 599], ['Rice', 1, 349]] },
  { ago: 40, store: 'heb', items: [['Bananas', 1.5, 81], ['Chicken breast', 1, 1320], ['Onions', 2, 238], ['Whole milk', 1, 345], ['Cereal', 1, 479]] },
  { ago: 47, store: 'wf', items: [['Sourdough bread', 1, 649], ['Berries', 2, 898], ['Shrimp', 1, 1599], ['Laundry detergent', 1, 1199]] },
  { ago: 55, store: 'costco', items: [['Ground beef', 1, 2199], ['Eggs', 1, 579], ['Toilet paper', 1, 2699], ['Orange juice', 1, 749]] },
  // Older months, placed by calendar month so "three months ago" always has data.
  { back: 2, day: 22, store: 'heb', items: [['Bananas', 2, 94], ['Whole milk', 1, 315], ['Pasta', 1, 149], ['Carrots', 2, 198], ['Cheddar cheese', 1, 449]] },
  { back: 3, day: 4, store: 'heb', items: [['Bananas', 2, 90], ['Whole milk', 1, 309], ['Tortillas', 1, 229], ['Chicken breast', 1, 1250]] },
  { back: 3, day: 13, store: 'tj', items: [['Large eggs', 1, 396], ['Spinach', 1, 279], ['Bacon', 1, 579], ['Yogurt', 2, 438]] },
  { back: 3, day: 24, store: 'costco', items: [['Eggs', 1, 649], ['Butter', 1, 1049], ['Paper towels', 1, 2199], ['Rotisserie chicken', 1, 499]] },
  { back: 4, day: 9, store: 'heb', items: [['Bananas', 2.2, 99], ['Ground beef', 1, 1099], ['Rice', 1, 369], ['Apples', 4, 596]] },
  { back: 4, day: 25, store: 'wf', items: [['Salmon fillet', 1, 1790], ['Avocados', 3, 447], ['Sourdough bread', 1, 639], ['Coffee', 1, 1349]] },
  { back: 5, day: 6, store: 'tj', items: [['Whole milk', 1, 319], ['Large eggs', 1, 359], ['Chicken thighs', 1, 1350], ['Broccoli', 1, 229]] },
  { back: 5, day: 18, store: 'heb', items: [['Bananas', 1.9, 86], ['Whole milk', 1, 305], ['Onions', 2, 218], ['Cereal', 1, 459], ['Pork chops', 1, 1180]] },
  { back: 5, day: 28, store: 'costco', items: [['Chicken breast', 1, 1899], ['Eggs', 1, 559], ['Toilet paper', 1, 2599]] },
]

const pad = (value) => String(value).padStart(2, '0')
const dayKey = (date) => date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())

export function makeSampleReceipts(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return PLAN.map((entry, index) => {
    const date = entry.ago !== undefined
      ? new Date(today.getFullYear(), today.getMonth(), today.getDate() - entry.ago)
      : new Date(today.getFullYear(), today.getMonth() - entry.back, entry.day)
    const store = STORES[entry.store]
    return {
      id: 'sample-' + index,
      store: store.name,
      purchased_on: dayKey(date),
      latitude: store.latitude,
      longitude: store.longitude,
      receipt_items: entry.items.map(([item_name, quantity, line_total_cents], position) => ({
        id: 'sample-' + index + '-' + position, item_name, quantity, line_total_cents, category: null,
      })),
    }
  }).sort((a, b) => b.purchased_on.localeCompare(a.purchased_on))
}
