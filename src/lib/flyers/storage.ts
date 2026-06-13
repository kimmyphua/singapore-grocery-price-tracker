import {
  createSupabaseAdminClient,
  getSupabaseAdminConfig
} from "@/lib/supabase/admin";
import type { FlyerSourceKey } from "./types";

type StorageResult<T> = Promise<{
  data: T | null;
  error: { message: string } | null;
}>;

export type FlyerStorageClient = {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        bytes: Uint8Array,
        options: { contentType: string; upsert: boolean }
      ): StorageResult<unknown>;
      createSignedUrl(
        path: string,
        expiresIn: number
      ): StorageResult<{ signedUrl: string }>;
      remove(paths: string[]): StorageResult<unknown>;
    };
  };
};

type StorageOptions = {
  client?: FlyerStorageClient;
  bucket?: string;
};

export function buildFlyerStoragePath(
  sourceKey: FlyerSourceKey,
  firstSeenAt: Date,
  contentHash: string
) {
  if (!/^[a-f0-9]+$/i.test(contentHash)) {
    throw new Error("Flyer content hash must be hexadecimal.");
  }
  return `${sourceKey}/${firstSeenAt.toISOString().slice(0, 10)}/${contentHash.toLowerCase()}.pdf`;
}

export async function uploadFlyerPdf({
  sourceKey,
  firstSeenAt,
  contentHash,
  bytes,
  ...options
}: StorageOptions & {
  sourceKey: FlyerSourceKey;
  firstSeenAt: Date;
  contentHash: string;
  bytes: Uint8Array;
}) {
  const path = buildFlyerStoragePath(sourceKey, firstSeenAt, contentHash);
  const storage = resolveStorage(options);
  const { error } = await storage.client.storage
    .from(storage.bucket)
    .upload(path, bytes, {
      contentType: "application/pdf",
      upsert: false
    });
  if (error) {
    throw new Error(`Flyer PDF upload failed: ${error.message}`);
  }
  return path;
}

export async function createFlyerDownloadUrl({
  storagePath,
  ...options
}: StorageOptions & { storagePath: string }) {
  const storage = resolveStorage(options);
  const { data, error } = await storage.client.storage
    .from(storage.bucket)
    .createSignedUrl(storagePath, 60);
  if (error || !data?.signedUrl) {
    throw new Error(
      `Flyer signed URL failed: ${error?.message ?? "missing signed URL"}`
    );
  }
  return data.signedUrl;
}

export async function deleteFlyerAsset({
  storagePath,
  ...options
}: StorageOptions & { storagePath: string }) {
  const storage = resolveStorage(options);
  const { error } = await storage.client.storage
    .from(storage.bucket)
    .remove([storagePath]);
  if (error) {
    throw new Error(`Flyer asset deletion failed: ${error.message}`);
  }
}

function resolveStorage(options: StorageOptions) {
  if (options.client && options.bucket) {
    return { client: options.client, bucket: options.bucket };
  }
  const env = getSupabaseAdminConfig();
  return {
    client:
      options.client ??
      (createSupabaseAdminClient() as unknown as FlyerStorageClient),
    bucket: options.bucket ?? env.flyerBucket
  };
}
