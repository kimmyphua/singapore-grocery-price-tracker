ALTER TABLE "PromotionFlyer" ADD COLUMN "seriesKey" TEXT;

UPDATE "PromotionFlyer"
SET "seriesKey" = CASE
    WHEN CONCAT_WS(' ', "sourceUrl", "assetUrl", "title") ILIKE '%weekly-savers%'
      OR (
        CONCAT_WS(' ', "sourceUrl", "assetUrl") ILIKE '%fairprice%'
        AND "title" ILIKE '%weekly savers%'
      )
      THEN 'fairprice-weekly-savers'
    WHEN CONCAT_WS(' ', "sourceUrl", "assetUrl", "title") ILIKE '%must-buy%'
      OR (
        CONCAT_WS(' ', "sourceUrl", "assetUrl") ILIKE '%fairprice%'
        AND "title" ILIKE '%must buy%'
      )
      THEN 'fairprice-must-buy'
    WHEN CONCAT_WS(' ', "sourceUrl", "assetUrl", "title") ILIKE '%grocery selections%'
      OR "sourceUrl" ILIKE '%coldstorage.com.sg/weekly-ads%'
      OR "assetUrl" ILIKE '%coldstorage.com.sg/weekly-ads%'
      THEN 'cold-storage-grocery-selections'
    WHEN CONCAT_WS(' ', "sourceUrl", "assetUrl", "title") ILIKE '%super-savings%'
      OR (
        CONCAT_WS(' ', "sourceUrl", "assetUrl") ILIKE '%giant.sg%'
        AND "title" ILIKE '%super savings%'
      )
      THEN 'giant-super-savings'
    WHEN CONCAT_WS(' ', "sourceUrl", "assetUrl", "title") ILIKE '%newspaper-advertisement%'
      OR CONCAT_WS(' ', "sourceUrl", "assetUrl") ILIKE '%shengsiong.com.sg%'
      OR CONCAT_WS(' ', "sourceUrl", "assetUrl") ILIKE '%shengsiongcontent%'
      THEN 'sheng-siong-newspaper-advertisement'
    ELSE 'legacy-' || "retailerId"
END;

ALTER TABLE "PromotionFlyer" ALTER COLUMN "seriesKey" SET NOT NULL;

CREATE INDEX "PromotionFlyer_seriesKey_validFrom_idx"
ON "PromotionFlyer"("seriesKey", "validFrom");

CREATE INDEX "PromotionFlyer_seriesKey_validTo_idx"
ON "PromotionFlyer"("seriesKey", "validTo");
