// Match specific products before broad ingredients such as milk, chicken, or flour.
const productOverrides = [
  ['Household', /\b(?:dish soap|dish liquid|dish gel|dish tabs|auto dish|kiwi super|laundry soap|soap pads?|body wash|cat litter|pet food|dog food|cat food|dog treats?|puppy pads?)\b/],
  ['Drinks', /\b(?:apple juice|orange juice|grape juice|tomato juice|carrot juice|cranberry juice|pineapple juice|apple cider(?! vinegar)|coffee beans?|cream soda|(?:coffee|tea) pods?|cherry limeade|brewing grapefruit|oj tropic pure|tropic pure oj|100 cranberry)\b/],
  ['Dairy & eggs', /\b(?:almond milk|milk half gallon almond|oat milk|soy milk|rice milk|coffee creamer|egg nog|dannon 2 go|ice cream|country crock|cntry crock|half and half|half half)\b/],
  ['Pantry', /\b(?:bread flour|brd flr|bread crumbs?|breadcrumbs?|(?:chicken|beef|vegetable|veggie|bone) (?:broth|stock|bouillon|soup)|(?:tomato|tom) (?:paste|sauce)|stew tom|(?:peanut|almond|cashew|apple) (?:butter|buttr)|pnt buttr|cocoa butter|pita chips|(?:tortilla|tort) chips|mac (?:and )?(?:cheese|chs)|yogurt raisins|dried (?:baby sweet )?(?:mango|pineapple)|pesto|water chestnuts?|(?:apple|banana|veggie|kale) chips|cider vinegar|coconut milk|baking soda|baking powder|green beans? canned|canned green beans?)\b/],
  ['Bakery', /\b(?:banana bread|pumpkin bread|garlic bread|corn bread|cornbread|apple pie|pumpkin pie|blueberry muffins?|(?:corn|flour) (?:tortillas?|torts?)|dinner rolls?|cinnamon rolls?)\b/],
  ['Meat & seafood', /\b(?:chuck roll|chuck roast|ground chuck|turkey bacon|pork roll|salmon fillets?|boneless breast|grd bfck)\b/],
  ['Produce', /\b(?:green beans?|snap peas|sweet potatoes|sweet potato|granny smith|grny smth|ppr bell red|ppr ylw|pine peel)\b/],
]

const categories = [
  ['Produce', [
    /\b(?:bananas?|apples?|pears?|grapes?|oranges?|mandarins?|clementines?|clem bag|tangerines?|grapefruits?|lemons?|limes?|peaches|peach|plums?|mango(?:es|s)?|papayas?|pineapples?|kiwifruits?|kiwi|cantaloupes?|watermelons?|honeydew|melons?|cherr(?:y|ies)|nectarines?|pomegranates?)\b/,
    /\b(?:berr(?:y|ies)|strawberr(?:y|ies)|blueberr(?:y|ies)|raspberr(?:y|ies)|blackberr(?:y|ies)|cranberr(?:y|ies)|nvl oranges?|gala|mcintosh|avocados?|cukes?|cucumbers?|tomato(?:es)?|carrots?|celery|onions?|ylw onion|scallions?|shallots?|garlic|grlc|leeks?)\b/,
    /\b(?:lettuce|romaine|arugula|spinach|kale|cabbage|bok choy|broccoli|cauliflower|asparagus|brussels sprouts?|mushrooms?|baby bella|bell peppers?|jalapenos?|poblano|zucchini|squash|eggplants?|radishes?|beets?|potato(?:es)?|russet|yams?|splendor pot|corn yellow|yellow corn|wht corn|corn on the cob)\b/,
    /\b(?:cilantro|parsley|basil|dill weed|mint leaves|ginger root|mix(?:ed)? veg(?:gies|etables)?|veg tray|frozen veg(?:etables)?|salad mix|salad kits?|org salad)\b/,
  ]],
  ['Pantry', [
    /\b(?:oats?|oatmeal|rice|quinoa|couscous|barley|bulgur|pasta|penne|spaghetti|macaroni|rotini|rigatoni|farfalle|fusill[io]?|fettuccine|linguine|lasagn[ae]|orzo|noodles?|ramen)\b/,
    /\b(?:flour|flr|sugar|sug|sweetener|stevia|honey|maple syrup|syrup|molasses|yeast|cornstarch|cornmeal|cake mix|pancake mix|biscuit mix|cereal|granola|granola bars?|cheerios?|chex|rice krisp(?:y|ies)|corn flakes)\b/,
    /\b(?:beans?|bns|lentils?|chickpeas?|garbanzos?|pinto|refried|hummus|applesauce|pickles?|capers?|olives?|peanuts?|almonds?|cashews?|walnuts?|pecans?|pistachios?|raisins?|dried fruit|trail mix|nutella|jam|fruit preserves|marmalade)\b/,
    /\b(?:olive oil|canola oil|vegetable oil|avocado oil|cooking oil|coconut oil|kro oil|shortening|lard|vinegar|ketchup|mustard|mayonnaise|mayo|bbq sauce|soy sauce|salsa|hot sauce|pasta sauce|marinara|salad dressing|catalina drs|mp dressing|broth|bouillon|soup|canned tuna|tuna wtr|canned salmon|canned vegetables)\b/,
    /\b(?:sea salt|table salt|iodized salt|kosher salt|black pepper|paprika|oregano|cumin|cinnamon|coriander|chile pwd|chili powder|vanilla extract|crackers?|ritz|goldfish|pretzels?|potato chips|popcorn|skittles|mentos|kit kat|almond joy|reeses|candy|choc chips|chocolate chips|chocolate bars?)\b/,
  ]],
  ['Dairy & eggs', [
    /\b(?:milk|(?:gv|heb)(?:ff|whl|skim|[12]pct)milk|yog[hu]r?t|yoghurt|ygrt?|chobani|dannon|noosa|kefir|cheese|cheddar|mozzarella|mozz|parmesan|parm|feta|ricotta|gouda|provolone|colby jack|mont jack|monterey jack|ctg chs|chs shreds)\b/,
    /\b(?:eggs?|(?:lg|lrg|large) (?:aa? )?(?:1 )?dz|butter|buttr|mpbutter|margarine|sour cream|cream cheese|heavy cream|whipping cream|whip cream|whipped cream|condensed milk|evap(?:orated)? milk|buttermilk|cr(?:m)? chs|sour crm)\b/,
  ]],
  ['Meat & seafood', [
    /\b(?:chicken|chk|chkn|rotisserie|beef|grd bf|pork|turkey|lamb|veal|venison|duck|ground beef|steaks?|sirloin|ribeye|brisket|tenderloin|drumsticks?|pork chops?|sliced ham|deli ham|ham|bacon|sausages?|brats?|bratwurst|chorizo|pepperoni|salami|bologna|hot dogs?|franks|meatballs?|nuggets?|burgers?)\b/,
    /\b(?:salmon|shrimp|prawns?|tilapia|cod fillets?|cod|tuna|trout|halibut|catfish|mahi mahi|sardines?|anchov(?:y|ies)|crab(?:meat)?|lobster|scallops?|mussels?|clams?|oysters?|fish sticks?|fish fillets?)\b/,
  ]],
  ['Bakery', [
    /\b(?:breads?|brd|bagels?|tortillas?|torts?|muffins?|english muffins?|buns?|rolls?|loaves|loaf|baguettes?|brioche|croissants?|sourdough|ciabatta|focaccia|pita|naan|flatbreads?|biscuits?|scones?|donuts?|doughnuts?|cupcakes?|cakes?|cookies?|brownies?|eclairs?|danish pastry)\b/,
  ]],
  ['Drinks', [
    /\b(?:coffee|tea|eng bkfst|english breakfast|espresso|frap|cold brew|folgers|juice|oj|minute maid|tropicana|motts juice|soda|cola|coke|coca cola|pepsi|sprite|fanta|dr pepper|drperten|root beer|ginger ale|lemonade|limeade|fruit punch|kool aid|gatorade|gtrade|gtrde|powerade|rockstar|red bull|energy drinks?|sports drinks?)\b/,
    /\b(?:water|aquafina|dasani|poland spring|liquid death|la croix|lacroix|topo chico|seltzer|sparkling water|spring water|club soda|tonic water|kombucha|beverages?|beer|wine|hard seltzer)\b/,
  ]],
  ['Household', [
    /\b(?:detergents?|tide(?:heorg\d+|pods|liquid)?|gain (?:pwdr|powder|2x|flings)|purex|persil|dryer sheets?|fabric softener|stain remover|oxiclean|bleach|clorox|lysol|windex|windx|windx spry|disinfect(?:ant|ing)?|sponges?|scrub pads?|dishwasher pods?|dawn (?:ultra|dish)|finish tabs?|cascade (?:pods|tabs|gel|platinum))\b/,
    /\b(?:soaps?|paper towels?|ppr twl|toilet papers?|bath tissues?|facial tissues?|kleenex|cottonelle|charmin|chr?mnsf4|bounty|bntysas2|scott (?:single|20 1100)|tissues?|napkins?|shopping bags?|trash bags?|garbage bags?|zipper bags?|ziploc|zpr sandw|sandwich bags?|freezer bags?|aluminum foil|plastic wrap|paper plates?)\b/,
    /\b(?:toothpaste|dental floss|toothbrush(?:es)?|mouthwash|shampoo|conditioner|deodorant|body spray|hair spray|irish spring|razors?|shaving cream|hand sanitizer|diapers?|baby wipes?|batteries|light bulbs?)\b/,
  ]],
  ['Non-grocery', [
    /\b(?:gift cards?|walmart plas|giftcards?|t shirts?|tee shirts?|tank tops?|jeans|leggings|sandals?|sneakers?|activewear|hoodies?|pullovers?|swimsuits?|nail polish|nail color|nail files?|digital cameras?|sd cards?|wifi routers?|sewing machines?|spray paint|motor oil|oil filters?|archery sets?|freeze frame bp)\b/,
  ]],
]

export const normalizeLabel = (name) => name.toLowerCase().trim().replace(/\s+/g, ' ')

export const defaultCategories = [...categories.map(([name]) => name), 'Uncategorized']

export function categoryKey(store, name) {
  return JSON.stringify([normalizeLabel(store), normalizeLabel(name)])
}

export function resolveCategory(rules, store, name, explicit) {
  const savedCategory = explicit?.trim() || rules.get(categoryKey(store, name))
  if (savedCategory) return savedCategory

  const label = normalizeLabel(name)
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')

  return productOverrides.find(([, pattern]) => pattern.test(label))?.[0] ||
    categories.find(([, patterns]) => patterns.some((pattern) => pattern.test(label)))?.[0] ||
    'Uncategorized'
}

export function tidyCategory(value, choices) {
  const cleaned = value.trim().replace(/\s+/g, ' ')
  return choices.find((category) => normalizeLabel(category) === normalizeLabel(cleaned)) ?? cleaned
}
