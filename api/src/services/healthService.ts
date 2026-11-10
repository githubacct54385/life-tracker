import { ping } from "../repositories/connectivityRepository.js";

/** True when the database answers. Returns no data from it. */
export async function databaseReachable(): Promise<boolean> {
  return ping();
}
