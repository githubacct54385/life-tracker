// Business rules for regular gifts (GIV-01). A gift is stored as the owner entered it: the month it is for is
// independent of the date given (AC-GIV-01.2), and any number of gifts can share a month (AC-GIV-01.3).
// The totals are computed from the list (shared/gifts.ts). Nothing here touches SQL.
import type { SaveGiftRequest } from "@life-tracker/shared";
import { giftRepository, type GiftRepository, type StoredGift } from "../repositories/giftRepository.js";

export interface GiftService {
  list(): Promise<StoredGift[]>;
  create(gift: SaveGiftRequest): Promise<StoredGift>;
  /** Undefined when there is no such gift. */
  edit(id: number, gift: SaveGiftRequest): Promise<StoredGift | undefined>;
  /** False when there is no such gift. */
  remove(id: number): Promise<boolean>;
}

export function createGiftService(repo: GiftRepository): GiftService {
  return {
    list: () => repo.listAll(),
    create: (gift) => repo.insert(gift),
    edit: (id, gift) => repo.update(id, gift),
    remove: (id) => repo.remove(id),
  };
}

export const giftService = createGiftService(giftRepository);
