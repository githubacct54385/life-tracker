// A stand-in for the people service in tests that use in-memory repositories, which need no real database. It still sets the person scope, as the real one does.
// Tests against a real database use the real `peopleService` instead.
import { withRequestUser } from "../repositories/requestPerson.js";
import type { PeopleService } from "../services/peopleService.js";

export function fakePeople(id = 1): PeopleService {
  return {
    ensureOwner: async () => ({ id, role: "admin", status: "active" }),
    runAs: (personId, run) => withRequestUser(personId, run),
  };
}
