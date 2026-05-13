"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createBlock, updateBlock, deleteBlock } from "@/lib/db/blocks";
import type { Category } from "@/lib/categories";

export type SaveBlockState = { error?: string };

export async function saveBlockAction(
  _prev: SaveBlockState | null,
  formData: FormData,
): Promise<SaveBlockState> {
  const idRaw = formData.get("id");
  const id = idRaw ? Number(idRaw) : null;
  const start_at = String(formData.get("start_at") ?? "");
  const end_at = String(formData.get("end_at") ?? "");
  const category = String(formData.get("category") ?? "") as Category;
  const labelRaw = formData.get("label");
  const label = labelRaw ? String(labelRaw).trim() : null;

  if (!start_at || !end_at || !category) {
    return { error: "missing required fields" };
  }
  if (new Date(end_at) <= new Date(start_at)) {
    return { error: "кінець має бути після початку" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  try {
    if (id) {
      await updateBlock(supabase, id, { start_at, end_at, category, label });
    } else {
      await createBlock(supabase, {
        user_id: user.id,
        start_at,
        end_at,
        category,
        label,
      });
    }
  } catch (e) {
    const raw = e instanceof Error ? e.message : "save failed";
    console.error(
      JSON.stringify({ level: "error", msg: "today.save_failed", error: raw }),
    );
    const friendly = raw.includes("time_blocks_no_overlap")
      ? "цей час уже зайнятий іншим блоком"
      : raw;
    return { error: friendly };
  }

  revalidatePath("/today");
  return {};
}

export type UpdateBlockTimesResult = { error?: string };

export async function updateBlockTimesAction(
  id: number,
  start_at: string,
  end_at: string,
): Promise<UpdateBlockTimesResult> {
  if (!id) return { error: "missing id" };
  if (new Date(end_at) <= new Date(start_at)) {
    return { error: "кінець має бути після початку" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  try {
    await updateBlock(supabase, id, { start_at, end_at });
  } catch (e) {
    const raw = e instanceof Error ? e.message : "update failed";
    console.error(
      JSON.stringify({
        level: "error",
        msg: "today.update_times_failed",
        error: raw,
      }),
    );
    const friendly = raw.includes("time_blocks_no_overlap")
      ? "цей час уже зайнятий"
      : raw;
    return { error: friendly };
  }

  revalidatePath("/today");
  return {};
}

export async function deleteBlockAction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!id) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  try {
    await deleteBlock(supabase, id);
  } catch (e) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "today.delete_failed",
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  }

  revalidatePath("/today");
}
