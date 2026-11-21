// Business rules for the grocery list (GRO-01). One list per person. An item's section is guessed from its name when the caller does not
// choose one, and is then stored, so a section the person picked is never changed by a later guess. Nothing here touches SQL.
import { guessSection, MAX_GROCERY_ITEMS, type AddGroceryRequest, type EditGroceryRequest, type GroceryItem } from "@life-tracker/shared";
import { groceryRepository, type GroceryRepository } from "../repositories/groceryRepository.js";

export type AddGroceryOutcome = { status: "added" | "already_added"; item: GroceryItem } | { status: "list_full" };

export interface GroceryService {
  list(): Promise<GroceryItem[]>;
  /** Adds an item. Sending the same id again changes nothing and answers "already_added". */
  add(request: AddGroceryRequest): Promise<AddGroceryOutcome>;
  /** Replaces every field of an item. Undefined when it does not exist. */
  edit(id: string, edit: EditGroceryRequest): Promise<GroceryItem | undefined>;
  /** Removes one item. False when it does not exist. */
  remove(id: string): Promise<boolean>;
  /** Finish trip and clear list are the same thing: the whole list is deleted, and nothing is kept (AC-GRO-01.5). */
  clear(): Promise<number>;
}

export function createGroceryService(repo: GroceryRepository): GroceryService {
  return {
    list: () => repo.list(MAX_GROCERY_ITEMS),

    async add(request) {
      // A repeated request must not be refused for a full list, so the limit is checked only after the id is known to be new.
      const outcome = await repo.add({
        id: request.id,
        name: request.name,
        quantity: request.quantity ?? "",
        note: request.note ?? "",
        section: request.section ?? guessSection(request.name),
      });
      if (outcome.created && (await repo.count()) > MAX_GROCERY_ITEMS) {
        await repo.remove(outcome.item.id);
        return { status: "list_full" };
      }
      return { status: outcome.created ? "added" : "already_added", item: outcome.item };
    },

    edit: (id, edit) => repo.edit(id, edit),

    remove: (id) => repo.remove(id),

    clear: () => repo.clear(),
  };
}

export const groceryService = createGroceryService(groceryRepository);
