ALTER TABLE "asset" DROP CONSTRAINT "asset_sha256_unique";--> statement-breakpoint
CREATE INDEX "asset_sha256_idx" ON "asset" USING btree ("sha256");