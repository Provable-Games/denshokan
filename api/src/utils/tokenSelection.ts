import { getTableColumns, sql } from "drizzle-orm";
import { tokens } from "../db/schema.js";

const columns = getTableColumns(tokens);

/** Avoid reading/detoasting artwork that the list response will omit. */
export function selectTokenColumns(includeUri: boolean) {
  return {
    ...columns,
    tokenUri: includeUri ? columns.tokenUri : sql<string | null>`NULL`,
  };
}
