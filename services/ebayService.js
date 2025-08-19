// services/ebayService.js
// Trading API: UploadSiteHostedPictures を axios 直叩きで実装
// - ExternalPictureURL（XML POST）→ 失敗時は multipart（XML→画像）
// - 共有URLの直リンク化、画像ダウンロード、JPEG正規化（WEBP/HEIC/αPNG→JPEG）
// 必要ENV: EBAY_USER_TOKEN（推奨）/ EBAY_AUTH_TOKEN（互換）, 任意: EBAY_SITE_ID(既定0), EBAY_SANDBOX("true"/"false"), EBAY_COMPAT_LEVEL

'use strict';

const axios = require('axios');
const sharp = require('sharp');
const FormData = require('form-data');
const { XMLParser } = require('fast-xml-parser');

const MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_PIC_NAME = 'Record_Image';
const DEFAULT_COMPAT = parseInt(process.env.EBAY_COMPAT_LEVEL || '1423', 10);
const EBAY_SITE_ID = String(process.env.EBAY_SITE_ID || '0'); // 0=US
const EBAY_SANDBOX = String(process.env.EBAY_SANDBOX || '').toLowerCase() === 'true';

const TRADING_ENDPOINT = EBAY_SANDBOX
  ? 'https://api.sandbox.ebay.com/ws/api.dll'
  : 'https://api.ebay.com/ws/api.dll';

// ───────────────── トークン取得（呼び出し時チェック） ─────────────────
const requireEbayToken = () => {
  const token =
    (process.env.EBAY_USER_TOKEN || '').trim() ||
    (process.env.EBAY_AUTH_TOKEN || '').trim();
  if (!token) {
    throw new Error('eBay のユーザートークンが未設定です。Render の Environment に EBAY_USER_TOKEN を設定してください。');
  }
  return token;
};

// ───────────────── 共有URL → 直リンク化 ─────────────────
const toDirectPublicUrl = (urlRaw) => {
  if (!urlRaw) return urlRaw;
  const url = String(urlRaw).trim();

  // Google Drive
  {
    const m1 = url.match(/drive\.google\.com\/file\/d\/([^/]+)/);
    const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
    const id = m1?.[1] || m2?.[1];
    if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
  }
  // Dropbox
  if (url.includes('dropbox.com/')) {
    return url.includes('?') ? url.replace(/dl=\d/, 'dl=1') : `${url}?dl=1`;
  }
  // OneDrive / SharePoint
  if (url.includes('1drv.ms') || url.includes('sharepoint.com')) {
    return url.includes('?') ? `${url}&download=1` : `${url}?download=1`;
  }
  return url;
};

// ───────────────── 画像DL & 正規化 ─────────────────
const isHtmlMagic = (buf) => buf.length >= 6 && buf[0] === 0x3c; // '<'

const fetchImageBuffer = async (url) => {
  const direct = toDirectPublicUrl(url);
  const res = await axios.get(direct, {
    responseType: 'arraybuffer',
    maxContentLength: MAX_BYTES,
    validateStatus: (s) => s >= 200 && s < 400,
  });
  const buf = Buffer.from(res.data);
  if (!buf.length) throw new Error('画像が 0 バイトです。');

  const ctype = String(res.headers['content-type'] || '').split(';')[0].trim();
  if (!ctype.startsWith('image/')) {
    if (isHtmlMagic(buf)) {
      throw new Error(`画像ではなく HTML が返却されました（直リンク化・公開権限を確認）。content-type=${ctype}`);
    }
  }
  return buf;
};

const normalizeToJpeg = async (buf) => {
  try {
    const meta = await sharp(buf, { pages: -1 }).metadata();
    const needsJpeg = meta.format !== 'jpeg' || Boolean(meta.hasAlpha) || (typeof meta.pages === 'number' && meta.pages > 1);
    let pipeline = sharp(buf);
    if (meta.hasAlpha) pipeline = pipeline.flatten({ background: '#ffffff' });
    return needsJpeg ? pipeline.jpeg({ quality: 92, mozjpeg: true }).toBuffer() : buf;
  } catch (e) {
    throw new Error(`画像を読み取れません（破損/非対応形式の可能性）: ${e.message}`);
  }
};

// ───────────────── Trading API 共通 ─────────────────
const tradingHeaders = (callName, isMultipart) => ({
  'X-EBAY-API-CALL-NAME': callName,
  'X-EBAY-API-SITEID': EBAY_SITE_ID,
  'X-EBAY-API-COMPATIBILITY-LEVEL': String(DEFAULT_COMPAT),
  'X-EBAY-API-RESPONSE-ENCODING': 'XML',
  ...(isMultipart ? {} : { 'Content-Type': 'text/xml' }),
});

const escapeXml = (s) =>
  String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

const buildXmlEnvelope = (innerXml) => {
  const token = requireEbayToken(); // 呼び出し時に検査
  return (
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<UploadSiteHostedPicturesRequest xmlns="urn:ebay:apis:eBLBaseComponents">` +
    `<RequesterCredentials><eBayAuthToken>${escapeXml(token)}</eBayAuthToken></RequesterCredentials>` +
    innerXml +
    `</UploadSiteHostedPicturesRequest>`
  );
};

const parseXml = (xml) => {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: true,
    trimValues: true,
  });
  return parser.parse(xml);
};

const extractFirstUrl = (json) => {
  const details =
    json?.UploadSiteHostedPicturesResponse?.SiteHostedPictureDetails ||
    json?.SiteHostedPictureDetails;

  const fullUrl = details?.FullURL;
  if (typeof fullUrl === 'string' && /^https?:\/\//i.test(fullUrl)) return fullUrl;

  const psm = details?.PictureSetMember;
  const members = Array.isArray(psm) ? psm : psm ? [psm] : [];
  for (const m of members) {
    const mu = m?.MemberURL;
    if (typeof mu === 'string' && /^https?:\/\//i.test(mu)) return mu;
  }
  const base = details?.BaseURL;
  if (typeof base === 'string' && /^https?:\/\//i.test(base)) return base;

  const urls = [];
  const walk = (v) => {
    if (!v) return;
    if (typeof v === 'string') {
      if (/^https?:\/\//i.test(v)) urls.push(v);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (typeof v === 'object') {
      Object.values(v).forEach(walk);
    }
  };
  walk(json);
  return urls[0] || null;
};

// ───────────────── ExternalPictureURL（XML POST） ─────────────────
const uploadViaExternalUrl = async (publicUrl, pictureName = DEFAULT_PIC_NAME) => {
  const inner =
    `<ExternalPictureURL>${escapeXml(publicUrl)}</ExternalPictureURL>` +
    `<PictureName>${escapeXml(pictureName)}</PictureName>` +
    `<PictureSystemVersion>2</PictureSystemVersion>`;
  const xml = buildXmlEnvelope(inner);

  const { data } = await axios.post(TRADING_ENDPOINT, xml, {
    headers: tradingHeaders('UploadSiteHostedPictures', false),
    responseType: 'text',
  });

  const json = parseXml(String(data));
  const url = extractFirstUrl(json);
  if (!url) {
    const ack = json?.UploadSiteHostedPicturesResponse?.Ack;
    const err = json?.UploadSiteHostedPicturesResponse?.Errors;
    throw new Error(`ExternalPictureURL で URL を取得できません（Ack=${ack || 'N/A'}）。Details: ${JSON.stringify(err || json).slice(0, 2000)}`);
  }
  return url;
};

// ───────────────── バイナリ添付（multipart: XML → 画像） ─────────────────
const uploadViaAttachment = async (jpegBuffer, pictureName = DEFAULT_PIC_NAME) => {
  const inner =
    `<PictureName>${escapeXml(pictureName)}</PictureName>` +
    `<PictureSystemVersion>2</PictureSystemVersion>`;
  const xml = buildXmlEnvelope(inner);

  const form = new FormData();
  form.append('XML Payload', xml, { contentType: 'text/xml; charset=utf-8' }); // 先に XML
  form.append('file', jpegBuffer, { filename: `${pictureName.replace(/[^\w.-]/g, '_')}.jpg`, contentType: 'image/jpeg' });

  const headers = { ...tradingHeaders('UploadSiteHostedPictures', true), ...form.getHeaders() };

  const { data } = await axios.post(TRADING_ENDPOINT, form, {
    headers,
    maxContentLength: MAX_BYTES,
    responseType: 'text',
  });

  const json = parseXml(String(data));
  const url = extractFirstUrl(json);
  if (!url) {
    const ack = json?.UploadSiteHostedPicturesResponse?.Ack;
    const err = json?.UploadSiteHostedPicturesResponse?.Errors;
    throw new Error(`添付アップロードは応答を受信しましたが URL を抽出できません（Ack=${ack || 'N/A'}）。Details: ${JSON.stringify(err || json).slice(0, 2000)}`);
  }
  return url;
};

// ───────────────── 公開 API ─────────────────
const uploadPictureFromUrl = async (imageUrl, opts = {}) => {
  const pictureName = opts.pictureName || DEFAULT_PIC_NAME;
  const publicUrl = toDirectPublicUrl(imageUrl);

  try {
    return await uploadViaExternalUrl(publicUrl, pictureName);
  } catch (_) {
    // 非公開/HTML 等で失敗時は添付にフォールバック
  }

  const raw = await fetchImageBuffer(publicUrl);
  const jpeg = await normalizeToJpeg(raw);
  return uploadViaAttachment(jpeg, pictureName);
};

const uploadPictureFromBuffer = async (buffer, opts = {}) => {
  const pictureName = opts.pictureName || DEFAULT_PIC_NAME;
  const jpeg = await normalizeToJpeg(buffer);
  return uploadViaAttachment(jpeg, pictureName);
};

module.exports = {
  uploadPictureFromUrl,
  uploadPictureFromBuffer,
  // テスト/デバッグ用
  toDirectPublicUrl,
};
