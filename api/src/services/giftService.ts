// Business rules for regular gifts (GIV-01). A gift is stored as the owner entered it: the month it is for is
// independent of the date given (AC-GIV-01.2), and any number of gifts can share a month (AC-GIV-01.3).
// A special contribution has an occasion instead of a "for" month and is stored apart from regular gifts (GIV-02).
// The totals are computed from the list (shared/gifts.ts). Nothing here touches SQL.
import type { SaveGiftRequest, SaveSpecialContributionRequest } from "@life-tracker/shared";
import { giftRepository, type GiftRepository, type StoredGift, type StoredSpecialContribution } from "../repositories/giftRepository.js";

export interface GiftService {
  list(): Promise<StoredGift[]>;
  create(gift: SaveGiftRequest): Promise<StoredGift>;
  /** Undefined when there is no such gift. */
  edit(id: number, gift: SaveGiftRequest): Promise<StoredGift | undefined>;
  /** False when there is no such gift. */
  remove(id: number): Promise<boolean>;
  /** Special contributions, newest first. Kept apart from regular gifts (GIV-02). */
  listSpecial(): Promise<StoredSpecialContribution[]>;
  createSpecial(contribution: SaveSpecialContributionRequest): Promise<StoredSpecialContribution>;
  /** Undefined when there is no such contribution. */
  editSpecial(id: number, contribution: SaveSpecialContributionRequest): Promise<StoredSpecialContribution | undefined>;
  /** False when there is no such contribution. */
  removeSpecial(id: number): Promise<boolean>;
}

export function createGiftService(repo: GiftRepository): GiftService {
  return {
    list: () => repo.listAll(),
    create: (gift) => repo.insert(gift),
    edit: (id, gift) => repo.update(id, gift),
    remove: (id) => repo.remove(id),
    listSpecial: () => repo.listSpecial(),
    createSpecial: (contribution) => repo.insertSpecial(contribution),
    editSpecial: (id, contribution) => repo.updateSpecial(id, contribution),
    removeSpecial: (id) => repo.removeSpecial(id),
  };
}

export const giftService = createGiftService(giftRepository);
