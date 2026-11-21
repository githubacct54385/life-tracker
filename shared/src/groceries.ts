// The grocery list (GRO-01): store sections in walking order, a word list that guesses a section from an item's name,
// the request and response shapes, and the counts the screens show. Pure: no clock, no I/O. Synthetic words only.
import { z } from "zod";

/** The sections, in the order a person walks the store (AC-GRO-01.3). "Other" is last and is the fallback. */
export const GROCERY_SECTIONS = ["Produce", "Bakery", "Meat and fish", "Dairy and eggs", "Frozen", "Pantry", "Drinks", "Household", "Other"] as const;
export type GrocerySection = (typeof GROCERY_SECTIONS)[number];

export const MAX_GROCERY_ITEMS = 300;
export const MAX_NAME_LENGTH = 80;
export const MAX_QUANTITY_LENGTH = 20;
export const MAX_NOTE_LENGTH = 200;

const WORDS: Record<Exclude<GrocerySection, "Other">, string[]> = {
  Produce: ["apple", "banana", "orange", "lemon", "lime", "grape", "berry", "strawberry", "blueberry", "melon", "pear", "peach", "avocado", "tomato", "potato", "onion", "garlic", "carrot", "celery", "lettuce", "spinach", "kale", "salad", "cucumber", "pepper", "broccoli", "cauliflower", "mushroom", "zucchini", "squash", "corn", "ginger", "herbs", "basil", "parsley", "cilantro", "fruit", "vegetable", "veggies"],
  Bakery: ["bread", "bagel", "bun", "roll", "tortilla", "croissant", "muffin", "baguette", "pita", "cake", "donut", "pastry"],
  "Meat and fish": ["chicken", "beef", "pork", "turkey", "bacon", "sausage", "ham", "steak", "mince", "lamb", "salmon", "tuna", "shrimp", "fish", "cod", "meat", "hot dog"],
  "Dairy and eggs": ["milk", "cheese", "butter", "yogurt", "yoghurt", "cream", "egg", "eggs", "sour cream", "cottage cheese"],
  Frozen: ["frozen", "ice cream", "pizza", "fries", "popsicle", "ice"],
  Pantry: ["rice", "pasta", "noodle", "flour", "sugar", "salt", "oil", "vinegar", "sauce", "ketchup", "mustard", "mayo", "cereal", "oats", "oatmeal", "beans", "lentil", "soup", "stock", "broth", "peanut butter", "jam", "honey", "spice", "cracker", "chips", "snack", "nuts", "cookie", "chocolate", "canned", "can of", "tin of", "syrup", "baking"],
  Drinks: ["water", "juice", "soda", "cola", "coffee", "tea", "beer", "wine", "sparkling", "lemonade", "drink"],
  Household: ["paper towel", "toilet paper", "tissue", "soap", "detergent", "shampoo", "conditioner", "toothpaste", "toothbrush", "trash bag", "bin bag", "sponge", "bleach", "cleaner", "foil", "cling film", "plastic wrap", "batteries", "light bulb", "diaper", "napkin", "dish"],
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const normalise = (text: string) => ` ${text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;

// Whole words only ("tea" must not match "steak"), with an optional plural "s" or "es". The longest match wins, so
// "peanut butter" is Pantry and not Dairy, and "ice cream" is Frozen and not Dairy.
const MATCHERS = (Object.entries(WORDS) as Array<[Exclude<GrocerySection, "Other">, string[]]>)
  .flatMap(([section, words]) => words.map((word) => ({ section, length: word.length, pattern: new RegExp(` ${escapeRegExp(word)}(?:e?s)? `) })))
  .sort((a, b) => b.length - a.length);

/** A guess at the store section for an item's name. "Other" when no word matches. Always the same answer for the same name. */
export function guessSection(name: string): GrocerySection {
  const text = normalise(name);
  for (const matcher of MATCHERS) if (matcher.pattern.test(text)) return matcher.section;
  return "Other";
}

const trimmed = (max: number) => z.string().trim().max(max);

export const grocerySectionSchema = z.enum(GROCERY_SECTIONS);

/** The client chooses an item's id, so a request that is sent twice creates one item (GRO-02 relies on this). */
export const groceryItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(MAX_NAME_LENGTH),
  quantity: z.string().max(MAX_QUANTITY_LENGTH),
  note: z.string().max(MAX_NOTE_LENGTH),
  section: grocerySectionSchema,
  found: z.boolean(),
});
export type GroceryItem = z.infer<typeof groceryItemSchema>;

export const groceryListResponseSchema = z.object({ items: z.array(groceryItemSchema) });
export type GroceryListResponse = z.infer<typeof groceryListResponseSchema>;

/** Adding: a name, and optionally a quantity, a note and a section. Without a section the server guesses one. */
export const addGroceryRequestSchema = z.object({
  id: z.string().uuid(),
  name: trimmed(MAX_NAME_LENGTH).min(1),
  quantity: trimmed(MAX_QUANTITY_LENGTH).optional(),
  note: trimmed(MAX_NOTE_LENGTH).optional(),
  section: grocerySectionSchema.optional(),
});
export type AddGroceryRequest = z.infer<typeof addGroceryRequestSchema>;

/** Editing: every field of the item except its id. */
export const editGroceryRequestSchema = z.object({
  name: trimmed(MAX_NAME_LENGTH).min(1),
  quantity: trimmed(MAX_QUANTITY_LENGTH),
  note: trimmed(MAX_NOTE_LENGTH),
  section: grocerySectionSchema,
  found: z.boolean(),
});
export type EditGroceryRequest = z.infer<typeof editGroceryRequestSchema>;

export interface GrocerySectionGroup {
  section: GrocerySection;
  items: GroceryItem[];
}

/** Items still to find, grouped by section in walking order. Sections with nothing in them are left out. Items keep their list order inside a section. */
export function groupBySection(items: readonly GroceryItem[]): GrocerySectionGroup[] {
  return GROCERY_SECTIONS.map((section) => ({ section, items: items.filter((item) => !item.found && item.section === section) })).filter((group) => group.items.length > 0);
}

/** The items already found, in list order (the "Found" group at the bottom, AC-GRO-01.2). */
export const foundItems = (items: readonly GroceryItem[]): GroceryItem[] => items.filter((item) => item.found);

/** "found X of Y" and how many are left, for the list screen and the Home card (AC-GRO-01.2, AC-GRO-01.9). */
export function groceryCounts(items: readonly GroceryItem[]): { total: number; found: number; left: number } {
  const found = items.filter((item) => item.found).length;
  return { total: items.length, found, left: items.length - found };
}
