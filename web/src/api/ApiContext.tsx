import { createContext, useContext, type ReactNode } from "react";
import { createClient } from "./client";
import type { Api } from "./types";

// Pages get their data through this one door (ADR-0014). The real client is the default; demo mode and tests supply their own.
const ApiContext = createContext<Api | undefined>(undefined);
let realClient: Api | undefined;

export function ApiProvider({ api, children }: { api: Api; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>;
}

export function useApi(): Api {
  return useContext(ApiContext) ?? (realClient ??= createClient());
}
