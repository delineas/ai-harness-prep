import type { Page, Title, TitleKind, TitleSort } from "../domain/catalog.ts";
import { formatHours } from "../domain/catalog.ts";
import type { CatalogRepository } from "./ports.ts";

export const PAGE_SIZE = 20;

export class InvalidQueryError extends Error {}

export interface ListTitlesInput {
  page?: number;
  kind?: string;
  text?: string;
  year?: number;
  sort?: string;
}

export type TitleListItem = Title & { readonly hoursLabel: string | null };

export function withLabel<T extends { hoursViewed: number | null }>(x: T): T & { hoursLabel: string | null } {
  return { ...x, hoursLabel: x.hoursViewed === null ? null : formatHours(x.hoursViewed) };
}

export function listTitles(repo: CatalogRepository, input: ListTitlesInput): Page<TitleListItem> {
  const page = input.page ?? 1;
  if (!Number.isInteger(page) || page < 1) throw new InvalidQueryError("page must be an integer >= 1");
  if (input.kind !== undefined && input.kind !== "movie" && input.kind !== "show") throw new InvalidQueryError("kind must be movie or show");
  const sort = input.sort ?? "title";
  if (sort !== "title" && sort !== "hours") throw new InvalidQueryError("sort must be title or hours");
  if (input.year !== undefined && (!Number.isInteger(input.year) || input.year < 1 || input.year > 9999)) {
    throw new InvalidQueryError("year must be a four-digit integer");
  }
  const text = input.text?.trim();
  const { items, total } = repo.listTitles(
    {
      kind: input.kind as TitleKind | undefined,
      text: text ? text : undefined,
      year: input.year,
      sort: sort as TitleSort,
    },
    (page - 1) * PAGE_SIZE,
    PAGE_SIZE,
  );
  return { items: items.map(withLabel), page, pageSize: PAGE_SIZE, total };
}
