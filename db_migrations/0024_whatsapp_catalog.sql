-- ==========================================
-- STEP: WHATSAPP CLOUD API CATALOG SHARING
-- ==========================================

-- Map internal catalog products to Meta Commerce Manager product_retailer_id
-- values so they can be shared as native WhatsApp product messages.
ALTER TABLE catalog_products ADD COLUMN retailer_id TEXT;

-- Optional WhatsApp Business catalog ID. If left blank the backend will
-- attempt to auto-resolve the first catalog connected to the WABA.
ALTER TABLE whatsapp_configs ADD COLUMN catalog_id TEXT;
