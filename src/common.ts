import type { ActionItem, ComicInfoPageAction, MetadataListItem } from "breeze-plugin-kit";

export const NOT_FOUND_IMAGE_URL = "";
export const PLACEHOLDER_IMAGE_PATH = "placeholder/image-404.png";

export function toStringMap(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function createActionItem(
  name: unknown,
  onTap: ComicInfoPageAction | null = null,
  extern: Record<string, unknown> = {},
) {
  return {
    name: String(name ?? ""),
    onTap,
    extern,
  };
}

export function createImage(
  input: {
    id?: unknown;
    url?: unknown;
    name?: unknown;
    path?: unknown;
    extern?: Record<string, unknown>;
  } = {},
) {
  return {
    id: String(input.id ?? ""),
    url: String(input.url ?? "").trim() || NOT_FOUND_IMAGE_URL,
    name: String(input.name ?? ""),
    path: String(input.path ?? "").trim() || PLACEHOLDER_IMAGE_PATH,
    extern: input.extern ?? {},
  };
}

export function createBasicMetadata(type: string, name: string, values: unknown): MetadataListItem {
  const list = Array.isArray(values) ? values : values == null ? [] : [values];
  return {
    type,
    name,
    value: list
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .map((item) => ({ name: item, onTap: null, extern: {} }) as ActionItem),
  };
}

export function createPaging(page = 1, total = 1) {
  return {
    page,
    pages: Math.max(1, total),
    total,
    hasReachedMax: true,
  };
}

import type { SettingsBundleContract } from "breeze-plugin-kit";
export type { SettingsBundleContract };
