"use server";

import { createServerSupabase } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

type AvatarUploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function uploadAvatar(formData: FormData): Promise<AvatarUploadResult> {
  const avatar = formData.get("avatar");
  if (!(avatar instanceof File) || avatar.size === 0) {
    return { ok: false, error: "No photo was received. Please try again." };
  }
  if (avatar.type !== "image/jpeg") {
    return { ok: false, error: "The cropped photo was not a JPEG." };
  }
  if (avatar.size > MAX_AVATAR_BYTES) {
    return { ok: false, error: "The cropped photo is too large." };
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Your session expired. Please sign in again." };

  // The server chooses the path from the authenticated user. Using the
  // service-role client here means replacements work even when a deployment's
  // storage policies have not yet caught up, without letting the browser pick
  // another user's path.
  const storage = serviceClient().storage.from("avatars");
  const path = `${user.id}/avatar.jpg`;
  const { error } = await storage.upload(path, avatar, {
    upsert: true,
    contentType: "image/jpeg",
    cacheControl: "3600",
  });
  if (error) return { ok: false, error: `Upload failed: ${error.message}` };

  const { data } = storage.getPublicUrl(path);
  return { ok: true, url: `${data.publicUrl}?t=${Date.now()}` };
}
