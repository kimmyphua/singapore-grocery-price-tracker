export type FlyerSourceKey =
  | "cold-storage-grocery-selections"
  | "fairprice-weekly-savers";

export type DiscoveredFlyerEdition = {
  sourceKey: FlyerSourceKey;
  title: string;
  sourceUrl: string;
  directPdfUrl: string | null;
  publicationUrl: string | null;
  assetKind: "PDF" | "PUBLICATION";
  validFrom: Date | null;
  validTo: Date | null;
  metadataFingerprint: string;
};
