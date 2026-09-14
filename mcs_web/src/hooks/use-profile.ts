"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  changeMyPassword,
  removeMyAvatar,
  uploadMyAvatar,
  type ChangeMyPasswordInput,
} from "@/lib/api/profile";
import { meQueryKey } from "@/hooks/use-auth";

export function useChangeMyPassword() {
  return useMutation({
    mutationFn: (body: ChangeMyPasswordInput) => changeMyPassword(body),
  });
}

export function useUploadMyAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fd: FormData) => uploadMyAvatar(fd),
    onSuccess: () => qc.invalidateQueries({ queryKey: meQueryKey }),
  });
}

export function useRemoveMyAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => removeMyAvatar(),
    onSuccess: () => qc.invalidateQueries({ queryKey: meQueryKey }),
  });
}
