import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  addGroceryRequestSchema,
  editGroceryRequestSchema,
  foundItems,
  GROCERY_SECTIONS,
  groceryCounts,
  groupBySection,
  guessSection,
  type GroceryItem,
} from "./groceries.js";

const item = (n: number, section: GroceryItem["section"], found = false): GroceryItem => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, name: `item ${n}`, quantity: "", note: "", section, found });

describe("guessSection", () => {
  it.each([
    ["apples", "Produce"],
    ["Bananas", "Produce"],
    ["sourdough bread", "Bakery"],
    ["chicken thighs", "Meat and fish"],
    ["milk", "Dairy and eggs"],
    ["a dozen eggs", "Dairy and eggs"],
    ["ice cream", "Frozen"],
    ["frozen peas", "Frozen"],
    ["peanut butter", "Pantry"],
    ["Rice!", "Pantry"],
    ["sparkling water", "Drinks"],
    ["toilet paper", "Household"],
    ["something unusual", "Other"],
    ["", "Other"],
  ])("[AC-GRO-01.3] %j is guessed as %s", (name, section) => {
    expect(guessSection(name)).toBe(section);
  });

  it("[AC-GRO-01.3] matches whole words only, so 'tea' is not found inside 'steak' or 'instead'", () => {
    expect(guessSection("steak")).toBe("Meat and fish");
    expect(guessSection("instead")).toBe("Other");
  });

  it("[AC-GRO-01.3] always answers with one of the sections, the same one every time, for any text", () => {
    fc.assert(
      fc.property(fc.string(), (name) => {
        const section = guessSection(name);
        expect(GROCERY_SECTIONS).toContain(section);
        expect(guessSection(name)).toBe(section);
      }),
    );
  });

  it("[AC-GRO-01.3] lists the sections in the order a person walks the store, with Other last", () => {
    expect(GROCERY_SECTIONS[0]).toBe("Produce");
    expect(GROCERY_SECTIONS[GROCERY_SECTIONS.length - 1]).toBe("Other");
    expect(new Set(GROCERY_SECTIONS).size).toBe(GROCERY_SECTIONS.length);
  });
});

describe("grouping and counts", () => {
  const items = [item(1, "Dairy and eggs"), item(2, "Produce"), item(3, "Produce", true), item(4, "Other"), item(5, "Produce")];

  it("[AC-GRO-01.2][AC-GRO-01.3] groups what is left by section in walking order, and leaves empty sections and found items out", () => {
    expect(groupBySection(items).map((group) => [group.section, group.items.map((i) => i.id.slice(-1))])).toEqual([
      ["Produce", ["2", "5"]],
      ["Dairy and eggs", ["1"]],
      ["Other", ["4"]],
    ]);
  });

  it("[AC-GRO-01.2] puts found items in their own group, and counts found and left", () => {
    expect(foundItems(items).map((i) => i.id.slice(-1))).toEqual(["3"]);
    expect(groceryCounts(items)).toEqual({ total: 5, found: 1, left: 4 });
    expect(groceryCounts([])).toEqual({ total: 0, found: 0, left: 0 });
  });
});

describe("request shapes", () => {
  const id = "11111111-1111-4111-8111-111111111111";

  it("[AC-GRO-01.1] accepts a name alone, trims it, and refuses an empty name or one that is too long", () => {
    expect(addGroceryRequestSchema.parse({ id, name: "  milk  " })).toEqual({ id, name: "milk" });
    expect(addGroceryRequestSchema.safeParse({ id, name: "   " }).success).toBe(false);
    expect(addGroceryRequestSchema.safeParse({ id, name: "x".repeat(81) }).success).toBe(false);
    expect(addGroceryRequestSchema.safeParse({ id: "not-an-id", name: "milk" }).success).toBe(false);
  });

  it("[AC-GRO-01.4] an edit carries every field and only a known section", () => {
    const edit = { name: "milk", quantity: "2", note: "", section: "Dairy and eggs", found: false };
    expect(editGroceryRequestSchema.safeParse(edit).success).toBe(true);
    expect(editGroceryRequestSchema.safeParse({ ...edit, section: "Aisle 9" }).success).toBe(false);
    expect(editGroceryRequestSchema.safeParse({ name: "milk" }).success).toBe(false);
  });
});
