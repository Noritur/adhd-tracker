/**
 * Category palette — locked: 5 hues + 3 neutrals (see design/brief.md).
 * Used by timeline blocks, edit sheet, week heatmap.
 */

export type Category =
  | "coded"
  | "work_other"
  | "sport"
  | "outdoors"
  | "social"
  | "rest"
  | "chores"
  | "other";

export type CategoryMeta = {
  value: Category;
  label: string;
  cssVar: string;
};

export const CATEGORIES: CategoryMeta[] = [
  { value: "coded", label: "код", cssVar: "var(--cat-coded)" },
  { value: "work_other", label: "робота", cssVar: "var(--cat-work)" },
  { value: "sport", label: "спорт", cssVar: "var(--cat-sport)" },
  { value: "outdoors", label: "надвір", cssVar: "var(--cat-outdoors)" },
  { value: "social", label: "люди", cssVar: "var(--cat-social)" },
  { value: "rest", label: "відпочинок", cssVar: "var(--cat-rest)" },
  { value: "chores", label: "побут", cssVar: "var(--cat-chores)" },
  { value: "other", label: "інше", cssVar: "var(--cat-other)" },
];

export const CATEGORIES_BY_VALUE: Record<Category, CategoryMeta> = Object.fromEntries(
  CATEGORIES.map((c) => [c.value, c]),
) as Record<Category, CategoryMeta>;

export function getCategoryMeta(value: Category): CategoryMeta {
  return CATEGORIES_BY_VALUE[value] ?? CATEGORIES_BY_VALUE.other;
}

export const DEFAULT_CATEGORY: Category = "coded";
