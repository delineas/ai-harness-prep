import type { Page, Title } from "../domain/catalog.ts";
import type { CatalogRepository } from "./ports.ts";

export const PAGE_SIZE = 20;

export class InvalidQueryError extends Error {}

export function listTitles(repo: CatalogRepository, input: { page?: number }): Page<Title> {
  const page = input.page ?? 1;
  if (!Number.isInteger(page) || page < 1) throw new InvalidQueryError("page must be an integer >= 1");
  const { items, total } = repo.listTitles((page - 1) * PAGE_SIZE, PAGE_SIZE);
  return { items, page, pageSize: PAGE_SIZE, total };
}
