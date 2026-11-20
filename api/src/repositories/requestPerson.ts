import { currentUserId, withRequestUser } from "../db/requestUser.js";

/**
 * Whose data this request may touch. Lives here because only `repositories/` may use `db/`; services and the
 * Worker use these (ADR-0026).
 */
export { currentUserId, withRequestUser };
