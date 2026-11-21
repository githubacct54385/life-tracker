import { MAX_GROCERY_ITEMS } from "@life-tracker/shared";
import { describe, expect, it } from "vitest";
import { fakeGroceryRepo } from "../testing/fakeGroceryRepository.js";
import { createGroceryService } from "./groceryService.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("groceryService", () => {
  it("[AC-GRO-01.3] guesses the section from the name, and keeps a section that was chosen", async () => {
    const service = createGroceryService(fakeGroceryRepo());
    const guessed = await service.add({ id: id(1), name: "yogurt" });
    const chosen = await service.add({ id: id(2), name: "yogurt", section: "Frozen" });
    expect(guessed).toMatchObject({ status: "added", item: { section: "Dairy and eggs" } });
    expect(chosen).toMatchObject({ item: { section: "Frozen" } });
  });

  it("[AC-GRO-01.3] a section the person moved an item to is not changed by a later edit that only changes the note", async () => {
    const service = createGroceryService(fakeGroceryRepo());
    await service.add({ id: id(1), name: "yogurt" });
    const edited = await service.edit(id(1), { name: "yogurt", quantity: "", note: "plain", section: "Pantry", found: false });
    expect(edited?.section).toBe("Pantry");
    expect((await service.list())[0]).toMatchObject({ section: "Pantry", note: "plain" });
  });

  it("[AC-GRO-01.1] adding the same id again changes nothing", async () => {
    const service = createGroceryService(fakeGroceryRepo());
    await service.add({ id: id(1), name: "milk" });
    expect(await service.add({ id: id(1), name: "something else" })).toMatchObject({ status: "already_added", item: { name: "milk" } });
    expect(await service.list()).toHaveLength(1);
  });

  it("[AC-GRO-01.1] refuses the item after the limit, and finish trip then empties the list", async () => {
    const repo = fakeGroceryRepo();
    const service = createGroceryService(repo);
    for (let n = 1; n <= MAX_GROCERY_ITEMS; n++) await service.add({ id: id(n), name: `item ${n}` });
    expect(await service.add({ id: id(MAX_GROCERY_ITEMS + 1), name: "one too many" })).toEqual({ status: "list_full" });
    expect(repo.rows).toHaveLength(MAX_GROCERY_ITEMS);
    expect(await service.add({ id: id(1), name: "repeat" })).toMatchObject({ status: "already_added" });
    expect(await service.clear()).toBe(MAX_GROCERY_ITEMS);
    expect(await service.list()).toEqual([]);
  });
});
