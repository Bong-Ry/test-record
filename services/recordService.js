// services/recordService.js
// 目的: レコード（1件 or 複数）の各アイテムについて、画像を eBay にアップロードし、得られた URL を rec.picURL に格納する

'use strict';

const { uploadPictureFromUrl } = require('./ebayService');

// 候補キーから元画像URLを拾う（手元データのキー名揺れに対応）
const pickImageUrl = (rec = {}) =>
  rec.picURL || rec.imgURL || rec.imageUrl || rec.image || rec.coverURL || rec.cover || rec.thumbnail;

const isEbayHosted = (url) =>
  typeof url === 'string' && /(ebayimg\.com|ebaystatic|ebayusercontent)/i.test(url);

/**
 * 1件分: picURL を eBay ホスト URL に正規化（無ければアップロードして作成）
 * @param {object} rec - 1レコードオブジェクト（title/artist 等は任意）
 * @returns {object} rec（picURL を eBay URL に更新済み）
 */
async function ensureEbayPicURL(rec) {
  if (!rec || typeof rec !== 'object') throw new Error('record is empty');
  if (rec.picURL && isEbayHosted(rec.picURL)) return rec; // 既に eBay ホスト

  const src = pickImageUrl(rec);
  if (!src) throw new Error('画像URLが見つかりません（picURL/imgURL/imageUrl 等のいずれかを指定）');

  const nameSeed =
    rec.title ||
    [rec.artist, rec.album].filter(Boolean).join(' - ') ||
    rec.catalogNo ||
    rec.sku ||
    'Record';

  const picName = String(nameSeed).slice(0, 60);
  const url = await uploadPictureFromUrl(src, { pictureName: picName });
  rec.picURL = url;
  return rec;
}

/**
 * 複数件: 配列を順次処理して picURL を埋める
 */
async function ensureEbayPicURLForAll(records = []) {
  const out = [];
  for (const rec of records) {
    out.push(await ensureEbayPicURL(rec));
  }
  return out;
}

module.exports = { ensureEbayPicURL, ensureEbayPicURLForAll };
