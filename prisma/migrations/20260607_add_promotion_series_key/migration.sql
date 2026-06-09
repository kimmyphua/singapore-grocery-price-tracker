ALTER TABLE "PromotionFlyer" ADD COLUMN "seriesKey" TEXT;

UPDATE "PromotionFlyer"
SET "seriesKey" = CASE
    WHEN "sourceUrl" ILIKE '%weekly-savers%' THEN 'fairprice-weekly-savers'
    WHEN "sourceUrl" ILIKE '%must-buy%' THEN 'fairprice-must-buy'
    WHEN "sourceUrl" ILIKE '%coldstorage.com.sg/weekly-ads%' THEN 'cold-storage-grocery-selections'
    WHEN "sourceUrl" ILIKE '%giant.sg/super-savings%' THEN 'giant-super-savings'
    WHEN "sourceUrl" ILIKE '%shengsiong.com.sg%' THEN 'sheng-siong-newspaper-advertisement'
    ELSE 'legacy-' || "retailerId"
END;

ALTER TABLE "PromotionFlyer" ALTER COLUMN "seriesKey" SET NOT NULL;

CREATE INDEX "PromotionFlyer_seriesKey_validFrom_idx"
ON "PromotionFlyer"("seriesKey", "validFrom");

CREATE INDEX "PromotionFlyer_seriesKey_validTo_idx"
ON "PromotionFlyer"("seriesKey", "validTo");
