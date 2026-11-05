const categories = [
  ['Produce', /\b(?:banana|apple|avocado|carrot|onion|onions|tomato|tomatoes|lettuce|spinach|broccoli|potato|berries|berry|mix veg|green onions)s?\b/],
  ['Pantry', /\b(?:oats|rice|pasta|fusill\w*|flour|sugar|sug|cereal|nutella|beans|peanut butter)\b/],
  ['Dairy & eggs', /\b(?:milk|yogurt|cheese|cheddar|eggs?|butter|cream cheese|sour cream)\b/],
  ['Meat & seafood', /\b(?:chicken|chk|beef|pork|turkey|salmon|shrimp|steak|bacon|sausage)\b/],
  ['Bakery', /\b(?:bread|bagel|tortilla|muffin|buns?|rolls?)s?\b/],
  ['Drinks', /\b(?:coffee|tea|juice|soda|sparkling water|lemonade)\b/],
  ['Household', /\b(?:detergent|tide\w*|soap|paper towel|toilet paper|scott single|shopping bag)\b/],
]

export const normalizeLabel = (name) => name.toLowerCase().trim().replace(/\s+/g, ' ')

export const defaultCategories = [...categories.map(([name]) => name), 'Non-grocery', 'Uncategorized']

export function categoryKey(store, name) {
  return JSON.stringify([normalizeLabel(store), normalizeLabel(name)])
}

export function resolveCategory(rules, store, name, explicit) {
  const label = normalizeLabel(name)
  return explicit?.trim() ||
    rules.get(categoryKey(store, name)) ||
    categories.find(([, pattern]) => pattern.test(label))?.[0] ||
    'Uncategorized'
}

export function tidyCategory(value, choices) {
  const cleaned = value.trim().replace(/\s+/g, ' ')
  return choices.find((category) => normalizeLabel(category) === normalizeLabel(cleaned)) ?? cleaned
}
