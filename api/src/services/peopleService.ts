// Who is making this request, as a person with an id (SET-04, ADR-0026). Today the only way in is the owner's Cloudflare Access
// token (ownerGuard has already checked it), so the owner's row is made the first time they are seen. Later stories add other
// ways in (Google sign-in, invitations) without changing how the rest of the app asks "whose data is this?".
import { userRepository, type Person, type UserRepository } from "../repositories/userRepository.js";
import { withRequestUser } from "../repositories/requestPerson.js";

export type { Person };

export interface PeopleService {
  /** The owner's person row (created on first sight). The caller has already verified the owner's identity. */
  ensureOwner(email: string): Promise<Person>;
  /** Runs one request for one person: every query inside is limited to that person's rows. */
  runAs<T>(personId: number, run: () => Promise<T>): Promise<T>;
}

export function createPeopleService(repo: UserRepository): PeopleService {
  return {
    async ensureOwner(email) {
      const normalised = email.trim().toLowerCase();
      return (await repo.findByEmail(normalised)) ?? repo.createOwner(normalised);
    },
    runAs: (personId, run) => withRequestUser(personId, run),
  };
}

export const peopleService = createPeopleService(userRepository);
