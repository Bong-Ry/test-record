// routes/recordRoutes.js
// 用途: API 経由で「画像→eBay アップロード→picURL 反映」を行う

'use strict';

const express = require('express');
const router = express.Router();
const { ensureEbayPicURL, ensureEbayPicURLForAll } = require('../services/recordService');

// 単純な疎通
router.get('/health', (_req, res) => res.json({ ok: true, service: 'test-record' }));

/**
 * 単体レコードを処理:
 * POST /api/record/ensure-pic
 * body: { record: {...} } または 直接レコードJSON
 */
router.post('/api/record/ensure-pic', async (req, res) => {
  try {
    const rec = req.body.record || req.body;
    const updated = await ensureEbayPicURL(rec);
    res.json({ ok: true, record: updated });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

/**
 * 複数レコードを処理:
 * POST /api/records/ensure-pic
 * body: { records: [ {...}, {...} ] }
 */
router.post('/api/records/ensure-pic', async (req, res) => {
  try {
    const records = Array.isArray(req.body.records) ? req.body.records : [];
    if (!records.length) throw new Error('records 配列がありません');
    const updated = await ensureEbayPicURLForAll(records);
    res.json({ ok: true, count: updated.length, records: updated });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = router;
