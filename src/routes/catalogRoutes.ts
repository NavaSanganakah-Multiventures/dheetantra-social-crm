import { Hono } from 'hono';
import { Env } from '../types';
import { requireRole, pagination } from '../shared';
import { formatForWhatsApp } from '../utils/phoneUtils';

const router = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// Fetch product metadata from a public product URL (schema.org JSON-LD,
// Shopify .json, etc.) to auto-fill retailer_id, name, price, image, etc.
// ---------------------------------------------------------------------------

function firstValue(value: any): any {
  if (Array.isArray(value)) return value[0];
  return value;
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.toString();
  } catch {
    return '';
  }
}

interface FetchedProduct {
  retailer_id?: string;
  name?: string;
  description?: string;
  price?: number;
  currency?: string;
  image_url?: string;
}

function extractFromJsonLd(nodes: any[]): FetchedProduct {
  const findProduct = (obj: any): any => {
    if (!obj || typeof obj !== 'object') return null;
    const types = Array.isArray(obj['@type']) ? obj['@type'] : [obj['@type']];
    if (types.some((t: any) => String(t).toLowerCase() === 'product')) return obj;
    if (Array.isArray(obj['@graph'])) {
      for (const child of obj['@graph']) {
        const found = findProduct(child);
        if (found) return found;
      }
    }
    return null;
  };

  for (const node of nodes) {
    const product = findProduct(node);
    if (!product) continue;

    let retailerId = product.sku || product.productID || product.mpn || product.identifier || '';
    if (typeof retailerId === 'object') retailerId = retailerId.value || '';

    let name = product.name || '';
    let description = product.description || '';
    if (typeof description === 'object') description = description.value || '';

    let image = firstValue(product.image);
    if (typeof image === 'object') image = image.url || image.contentUrl || '';

    let price: number | undefined;
    let currency = 'INR';
    const offers = product.offers || product.offer;
    const offer = Array.isArray(offers) ? offers[0] : offers;
    if (offer && typeof offer === 'object') {
      const rawPrice = offer.price || offer.lowPrice;
      if (rawPrice !== undefined) {
        const parsed = typeof rawPrice === 'string' ? parseFloat(rawPrice) : Number(rawPrice);
        if (!isNaN(parsed)) price = parsed;
      }
      if (offer.priceCurrency) currency = String(offer.priceCurrency).toUpperCase();
    }

    if (retailerId || name || image) {
      return {
        retailer_id: retailerId ? String(retailerId) : undefined,
        name: name ? String(name) : undefined,
        description: description ? String(description) : undefined,
        price,
        currency,
        image_url: image ? String(image) : undefined,
      };
    }
  }
  return {};
}

async function fetchProductFromUrl(url: string): Promise<FetchedProduct> {
  const normalized = normalizeUrl(url);
  if (!normalized) throw new Error('Invalid URL');

  const fetchHtml = async (target: string): Promise<string> => {
    const res = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    return res.text();
  };

  const html = await fetchHtml(normalized);

  // Parse all JSON-LD script tags
  const ldNodes: any[] = [];
  const matches = html.matchAll(/<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of matches) {
    try {
      const node = JSON.parse(match[1].trim());
      if (Array.isArray(node)) ldNodes.push(...node);
      else ldNodes.push(node);
    } catch {
      // Ignore malformed JSON-LD
    }
  }

  let result = extractFromJsonLd(ldNodes);
  if (!result.retailer_id) {
    // Try Shopify product JSON fallback
    try {
      const shopifyUrl = normalized.replace(/\?.*/, '') + '.json';
      const sRes = await fetch(shopifyUrl, { headers: { 'Accept': 'application/json' } });
      if (sRes.ok) {
        const sData: any = await sRes.json();
        const p = sData.product;
        if (p) {
          const variant = Array.isArray(p.variants) && p.variants[0] ? p.variants[0] : p;
          const price = variant.price ? parseFloat(variant.price) : undefined;
          result = {
            retailer_id: variant.sku || variant.id || result.retailer_id,
            name: p.title || result.name,
            description: (p.body_html || '').replace(/<[^>]+>/g, ' ').trim() || result.description,
            price: price !== undefined && !isNaN(price) ? price : result.price,
            currency: (variant.currency || 'INR').toUpperCase(),
            image_url: p.image?.src || (Array.isArray(p.images) && p.images[0]?.src) || result.image_url,
          };
        }
      }
    } catch {
      // Shopify fallback failed
    }
  }

  // Very light HTML fallback: og:title / og:description / og:image
  if (!result.name && !result.retailer_id) {
    const meta: Record<string, string> = {};
    const metaMatches = html.matchAll(/<meta[^>]+property="og:([^"]+)"[^>]+content="([^"]*)"/gi);
    for (const m of metaMatches) meta[m[1]] = m[2];
    if (meta.title) result.name = meta.title;
    if (meta.description) result.description = meta.description;
    if (meta.image) result.image_url = meta.image;
  }

  return result;
}

function withWorkspace(c: any) {
  const workspaceId = c.req.header('x-workspace-id');
  if (!workspaceId) return { error: c.json({ error: 'Workspace ID required' }, 400) };
  return { workspaceId };
}

// List catalogs
router.get('/api/catalogs', async (c) => {
  const { workspaceId, error } = withWorkspace(c);
  if (error) return error;
  const status = c.req.query('status') || 'all';
  const { limit, offset } = pagination(c, 100);
  let sql = 'SELECT * FROM catalogs WHERE workspace_id = ?';
  const params: any[] = [workspaceId];
  if (status !== 'all') {
    sql += ' AND status = ?';
    params.push(status);
  }
  sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);
  try {
    const { results } = await c.env.DB.prepare(sql).bind(...params).all();
    const catalogIds = (results || []).map((r: any) => r.id).filter(Boolean);
    const counts = new Map<string, number>();
    if (catalogIds.length) {
      const placeholders = catalogIds.map(() => '?').join(',');
      const countRes = await c.env.DB.prepare(`SELECT catalog_id, COUNT(*) as cnt FROM catalog_products WHERE catalog_id IN (${placeholders}) AND status = 'active' GROUP BY catalog_id`).bind(...catalogIds).all();
      for (const row of countRes.results || []) {
        const r = row as any;
        counts.set(r.catalog_id, r.cnt);
      }
    }
    const catalogs = (results || []).map((cat: any) => ({
      ...cat,
      products_count: counts.get(cat.id) || 0,
    }));
    return c.json({ catalogs });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Create catalog
router.post('/api/catalogs', requireRole('owner', 'admin'), async (c) => {
  const { workspaceId, error } = withWorkspace(c);
  if (error) return error;
  const { name, description, status, cover_image_url } = await c.req.json();
  if (!name || typeof name !== 'string') {
    return c.json({ error: 'Catalog name is required' }, 400);
  }
  try {
    const id = crypto.randomUUID();
    await c.env.DB.prepare('INSERT INTO catalogs (id, workspace_id, name, description, status, cover_image_url) VALUES (?, ?, ?, ?, ?, ?)').bind(id, workspaceId, name, description || null, status || 'active', cover_image_url || null).run();
    const catalog = await c.env.DB.prepare('SELECT * FROM catalogs WHERE id = ?').bind(id).first();
    return c.json({ success: true, catalog });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Get catalog with products
router.get('/api/catalogs/:id', async (c) => {
  const { workspaceId, error } = withWorkspace(c);
  if (error) return error;
  const id = c.req.param('id');
  try {
    const catalog = await c.env.DB.prepare('SELECT * FROM catalogs WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).first();
    if (!catalog) return c.json({ error: 'Catalog not found' }, 404);
    const { results: products } = await c.env.DB.prepare('SELECT * FROM catalog_products WHERE catalog_id = ? AND workspace_id = ? ORDER BY sort_order, created_at').bind(id, workspaceId).all();
    return c.json({ catalog, products: products || [] });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Update catalog
router.put('/api/catalogs/:id', requireRole('owner', 'admin'), async (c) => {
  const { workspaceId, error } = withWorkspace(c);
  if (error) return error;
  const id = c.req.param('id');
  const { name, description, status, cover_image_url } = await c.req.json();
  try {
    const existing = await c.env.DB.prepare('SELECT id FROM catalogs WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).first();
    if (!existing) return c.json({ error: 'Catalog not found' }, 404);
    await c.env.DB.prepare('UPDATE catalogs SET name = COALESCE(?, name), description = COALESCE(?, description), status = COALESCE(?, status), cover_image_url = COALESCE(?, cover_image_url) WHERE id = ?').bind(name, description, status, cover_image_url, id).run();
    const catalog = await c.env.DB.prepare('SELECT * FROM catalogs WHERE id = ?').bind(id).first();
    return c.json({ success: true, catalog });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Delete catalog (cascade to products via FK)
router.delete('/api/catalogs/:id', requireRole('owner', 'admin'), async (c) => {
  const { workspaceId, error } = withWorkspace(c);
  if (error) return error;
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM catalogs WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).run();
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// List products for a catalog
router.get('/api/catalogs/:id/products', async (c) => {
  const { workspaceId, error } = withWorkspace(c);
  if (error) return error;
  const catalogId = c.req.param('id');
  const { limit, offset } = pagination(c, 200);
  try {
    const { results } = await c.env.DB.prepare('SELECT * FROM catalog_products WHERE catalog_id = ? AND workspace_id = ? ORDER BY sort_order, created_at LIMIT ? OFFSET ?').bind(catalogId, workspaceId, limit, offset).all();
    return c.json({ products: results || [] });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Add product to catalog
router.post('/api/catalogs/:id/products', requireRole('owner', 'admin'), async (c) => {
  const { workspaceId, error } = withWorkspace(c);
  if (error) return error;
  const catalogId = c.req.param('id');
  const { name, description, price, currency, image_url, retailer_id, sort_order } = await c.req.json();
  if (!name || typeof name !== 'string') {
    return c.json({ error: 'Product name is required' }, 400);
  }
  try {
    const catalog = await c.env.DB.prepare('SELECT id FROM catalogs WHERE id = ? AND workspace_id = ?').bind(catalogId, workspaceId).first();
    if (!catalog) return c.json({ error: 'Catalog not found' }, 404);
    const id = crypto.randomUUID();
    const numericPrice = typeof price === 'number' ? price : (parseFloat(price as any) || 0);
    await c.env.DB.prepare('INSERT INTO catalog_products (id, catalog_id, workspace_id, name, description, price, currency, image_url, retailer_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, catalogId, workspaceId, name, description || null, numericPrice, currency || 'INR', image_url || null, retailer_id || null, typeof sort_order === 'number' ? sort_order : 0).run();
    const product = await c.env.DB.prepare('SELECT * FROM catalog_products WHERE id = ?').bind(id).first();
    return c.json({ success: true, product });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Update product (belongs to workspace)
router.put('/api/catalogs/products/:id', requireRole('owner', 'admin'), async (c) => {
  const { workspaceId, error } = withWorkspace(c);
  if (error) return error;
  const id = c.req.param('id');
  const { name, description, price, currency, image_url, retailer_id, status, sort_order } = await c.req.json();
  try {
    const existing = await c.env.DB.prepare('SELECT id FROM catalog_products WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).first();
    if (!existing) return c.json({ error: 'Product not found' }, 404);
    const numericPrice = price !== undefined ? (typeof price === 'number' ? price : (parseFloat(price as any) || 0)) : undefined;
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (numericPrice !== undefined) updates.price = numericPrice;
    if (currency !== undefined) updates.currency = currency;
    if (image_url !== undefined) updates.image_url = image_url;
    if (retailer_id !== undefined) updates.retailer_id = retailer_id;
    if (status !== undefined) updates.status = status;
    if (sort_order !== undefined) updates.sort_order = typeof sort_order === 'number' ? sort_order : parseInt(sort_order as any) || 0;
    if (Object.keys(updates).length) {
      const cols = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      await c.env.DB.prepare(`UPDATE catalog_products SET ${cols} WHERE id = ?`).bind(...Object.values(updates), id).run();
    }
    const product = await c.env.DB.prepare('SELECT * FROM catalog_products WHERE id = ?').bind(id).first();
    return c.json({ success: true, product });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Delete product
router.delete('/api/catalogs/products/:id', requireRole('owner', 'admin'), async (c) => {
  const { workspaceId, error } = withWorkspace(c);
  if (error) return error;
  const id = c.req.param('id');
  try {
    await c.env.DB.prepare('DELETE FROM catalog_products WHERE id = ? AND workspace_id = ?').bind(id, workspaceId).run();
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Share product or catalog into a conversation
router.post('/api/catalogs/share', requireRole('owner', 'admin', 'member'), async (c) => {
  const { workspaceId, error } = withWorkspace(c);
  if (error) return error;
  const { conversationId, type, productId, catalogId, note } = await c.req.json();
  if (!conversationId || !['product', 'catalog'].includes(type)) {
    return c.json({ error: 'conversationId and valid type are required' }, 400);
  }
  if (type === 'product' && !productId) return c.json({ error: 'productId required' }, 400);
  if (type === 'catalog' && !catalogId) return c.json({ error: 'catalogId required' }, 400);
  try {
    const conversation = await c.env.DB.prepare('SELECT id, platform FROM conversations WHERE id = ? AND workspace_id = ?').bind(conversationId, workspaceId).first<{ id: string; platform: string }>();
    if (!conversation) return c.json({ error: 'Conversation not found' }, 404);
    let content = '';
    let mediaUrl: string | null = null;
    if (type === 'product') {
      const product = await c.env.DB.prepare('SELECT * FROM catalog_products WHERE id = ? AND workspace_id = ?').bind(productId, workspaceId).first<any>();
      if (!product) return c.json({ error: 'Product not found' }, 404);
      content = product.name;
      mediaUrl = JSON.stringify({
        type: 'catalog_product',
        product_id: product.id,
        catalog_id: product.catalog_id,
        name: product.name,
        price: product.price,
        currency: product.currency,
        image_url: product.image_url,
        description: product.description,
        note: note || '',
      });
    } else {
      const catalog = await c.env.DB.prepare('SELECT * FROM catalogs WHERE id = ? AND workspace_id = ?').bind(catalogId, workspaceId).first<any>();
      if (!catalog) return c.json({ error: 'Catalog not found' }, 404);
      const { results: products } = await c.env.DB.prepare('SELECT name, price, currency FROM catalog_products WHERE catalog_id = ? AND workspace_id = ? AND status = ? ORDER BY sort_order').bind(catalog.id, workspaceId, 'active').all();
      content = catalog.name;
      mediaUrl = JSON.stringify({
        type: 'catalog',
        catalog_id: catalog.id,
        name: catalog.name,
        description: catalog.description,
        cover_image_url: catalog.cover_image_url,
        products_count: products ? products.length : 0,
        products_preview: products || [],
        note: note || '',
      });
    }
    const savedMessageId = crypto.randomUUID();
    const platformMsgId = crypto.randomUUID();
    const now = new Date().toISOString();
    await c.env.DB.prepare('INSERT INTO messages (id, conversation_id, sender_type, message_type, content, media_url, platform_message_id, platform, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(savedMessageId, conversationId, 'agent', type === 'product' ? 'catalog_product' : 'catalog', content, mediaUrl, platformMsgId, conversation.platform || 'whatsapp', now).run();
    await c.env.DB.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(conversationId).run();
    try {
      const globalDoId = c.env.CHAT_DO.idFromName(`global-${workspaceId}`);
      const stub = c.env.CHAT_DO.get(globalDoId);
      await stub.fetch(new Request('http://do/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'new_message',
          message: {
            id: savedMessageId,
            conversation_id: conversationId,
            sender_type: 'agent',
            message_type: type === 'product' ? 'catalog_product' : 'catalog',
            content: content,
            media_url: mediaUrl,
            platform_message_id: platformMsgId,
            platform: conversation.platform || 'whatsapp',
            status: 'sent',
            created_at: now,
          },
        }),
      }));
    } catch (doErr) {
      console.error('Failed to broadcast catalog share:', doErr);
    }
    return c.json({ success: true, message: { id: savedMessageId, conversation_id: conversationId, content, media_url: mediaUrl, created_at: now } });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Send a native WhatsApp Cloud API product or multi-product message
router.post('/api/catalogs/whatsapp/send', requireRole('owner', 'admin', 'member'), async (c) => {
  const { workspaceId, error } = withWorkspace(c);
  if (error) return error;

  const { conversationId, type, productId, catalogId, body, footer, header, sectionTitle, phoneNumberId } = await c.req.json();
  if (!conversationId || !['product', 'catalog'].includes(type)) {
    return c.json({ error: 'conversationId and valid type are required' }, 400);
  }
  if (type === 'product' && !productId) return c.json({ error: 'productId required' }, 400);
  if (type === 'catalog' && !catalogId) return c.json({ error: 'catalogId required' }, 400);

  try {
    const conversation = await c.env.DB.prepare(
      'SELECT id, contact_id, platform, phone_number_id FROM conversations WHERE id = ? AND workspace_id = ?'
    ).bind(conversationId, workspaceId).first<any>();
    if (!conversation) return c.json({ error: 'Conversation not found' }, 404);
    if (conversation.platform !== 'whatsapp') {
      return c.json({ error: 'WhatsApp native catalog messages can only be sent to WhatsApp conversations' }, 400);
    }

    const contact = await c.env.DB.prepare(
      'SELECT platform_contact_id, name FROM contacts WHERE id = ? AND workspace_id = ?'
    ).bind(conversation.contact_id, workspaceId).first<any>();
    if (!contact) return c.json({ error: 'Contact not found' }, 404);
    const to = formatForWhatsApp(String(contact.platform_contact_id));
    if (!to) return c.json({ error: 'Invalid contact phone number' }, 400);

    let config: any = null;
    const preferredPhone = phoneNumberId || conversation.phone_number_id;
    if (preferredPhone) {
      config = await c.env.DB.prepare(
        'SELECT phone_number_id, access_token, waba_id, catalog_id FROM whatsapp_configs WHERE workspace_id = ? AND phone_number_id = ?'
      ).bind(workspaceId, preferredPhone).first();
    }
    if (!config) {
      config = await c.env.DB.prepare(
        'SELECT phone_number_id, access_token, waba_id, catalog_id FROM whatsapp_configs WHERE workspace_id = ?'
      ).bind(workspaceId).first();
    }
    if (!config) return c.json({ error: 'WhatsApp is not configured for this workspace' }, 400);

    // Resolve Meta catalog id: explicit catalog_id wins, otherwise try WABA.
    let metaCatalogId = config.catalog_id;
    if (!metaCatalogId && config.waba_id) {
      try {
        const catalogsRes = await fetch(
          `https://graph.facebook.com/v20.0/${config.waba_id}/owned_product_catalogs?fields=id,name&limit=1`,
          { headers: { Authorization: `Bearer ${config.access_token}` } }
        );
        const catalogsData: any = await catalogsRes.json();
        if (catalogsData?.data?.length) metaCatalogId = catalogsData.data[0].id;
      } catch (e) {
        console.error('[Catalog] Failed to fetch Meta catalogs:', e);
      }
    }
    if (!metaCatalogId) {
      return c.json({ error: 'No WhatsApp product catalog configured for this workspace. Set catalog_id in WhatsApp config or connect a Meta catalog to your WABA.' }, 400);
    }

    let payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
    };

    let content = '';
    let mediaPayload: any = { type, meta_catalog_id: metaCatalogId };

    if (type === 'product') {
      const product = await c.env.DB.prepare(
        'SELECT id, name, retailer_id FROM catalog_products WHERE id = ? AND workspace_id = ?'
      ).bind(productId, workspaceId).first<any>();
      if (!product) return c.json({ error: 'Product not found' }, 404);
      if (!product.retailer_id) {
        return c.json({ error: 'Product is missing retailer_id. Map it to a Meta catalog product before sharing on WhatsApp.' }, 400);
      }
      content = product.name;
      mediaPayload.product_id = product.id;
      mediaPayload.product_name = product.name;
      payload.type = 'product';
      payload.product = { catalog_id: metaCatalogId, product_retailer_id: product.retailer_id };
    } else {
      const catalog = await c.env.DB.prepare(
        'SELECT id, name FROM catalogs WHERE id = ? AND workspace_id = ?'
      ).bind(catalogId, workspaceId).first<any>();
      if (!catalog) return c.json({ error: 'Catalog not found' }, 404);
      const { results: products } = await c.env.DB.prepare(
        "SELECT id, name, retailer_id FROM catalog_products WHERE catalog_id = ? AND workspace_id = ? AND status = 'active' AND retailer_id IS NOT NULL ORDER BY sort_order"
      ).bind(catalogId, workspaceId).all();
      const items = (products || []).map((p: any) => ({ product_retailer_id: p.retailer_id }));
      if (items.length === 0) {
        return c.json({ error: 'Catalog has no products mapped to Meta retailer IDs' }, 400);
      }
      content = catalog.name;
      mediaPayload.catalog_id = catalog.id;
      mediaPayload.catalog_name = catalog.name;
      mediaPayload.body = body;
      mediaPayload.header = header;
      mediaPayload.footer = footer;
      mediaPayload.section_title = sectionTitle;

      payload.type = 'multi_product';
      payload.multi_product = {
        catalog_id: metaCatalogId,
        body: { text: body || `Check out ${catalog.name}!` },
        action: {
          catalog_id: metaCatalogId,
          sections: [{ title: sectionTitle || 'Products', product_items: items.slice(0, 30) }],
        },
      };
      if (header && String(header).trim()) {
        payload.multi_product.header = { type: 'text', text: header };
      }
      if (footer && String(footer).trim()) {
        payload.multi_product.footer = { text: footer };
      }
    }

    const metaResponse = await fetch(
      `https://graph.facebook.com/v19.0/${config.phone_number_id}/messages`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    const metaData: any = await metaResponse.json();
    if (metaData.error) return c.json({ error: metaData.error.message }, 400);

    const savedMessageId = crypto.randomUUID();
    const platformMsgId = metaData.messages?.[0]?.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const mediaUrl = JSON.stringify(mediaPayload);

    await c.env.DB.prepare(
      'INSERT INTO messages (id, conversation_id, sender_type, message_type, content, media_url, platform_message_id, platform, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(savedMessageId, conversationId, 'agent', type, content, mediaUrl, platformMsgId, 'whatsapp', now).run();
    await c.env.DB.prepare('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(conversationId).run();

    try {
      const globalDoId = c.env.CHAT_DO.idFromName(`global-${workspaceId}`);
      const stub = c.env.CHAT_DO.get(globalDoId);
      await stub.fetch(new Request('http://do/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'new_message',
          message: {
            id: savedMessageId,
            conversation_id: conversationId,
            sender_type: 'agent',
            message_type: type,
            content,
            media_url: mediaUrl,
            platform_message_id: platformMsgId,
            platform: 'whatsapp',
            status: 'sent',
            created_at: now,
          },
        }),
      }));
    } catch (doErr) {
      console.error('Failed to broadcast WhatsApp catalog message:', doErr);
    }

    return c.json({ success: true, message: 'WhatsApp catalog message sent', data: { id: savedMessageId, platform_message_id: platformMsgId } });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// Fetch product details from a public product URL
router.post('/api/catalogs/fetch-product', requireRole('owner', 'admin', 'member'), async (c) => {
  const { workspaceId, error } = withWorkspace(c);
  if (error) return error;

  // workspaceId kept for logging/rate-limiting; fetching is generic.
  void workspaceId;
  const { url } = await c.req.json();
  if (!url || typeof url !== 'string') return c.json({ error: 'url is required' }, 400);

  try {
    const product = await fetchProductFromUrl(url);
    if (!product.retailer_id && !product.name) {
      return c.json({ error: 'Could not extract product details from URL. Add retailer_id manually or check the page has schema.org/Shopify markup.' }, 422);
    }
    return c.json({ success: true, product });
  } catch (e: any) {
    console.error('[Catalog] fetch-product error:', e);
    return c.json({ error: e.message || 'Failed to fetch URL' }, 400);
  }
});

export default router;