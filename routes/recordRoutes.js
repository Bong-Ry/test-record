/* Router: record processing & CSV (eBay) */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { google } = require('googleapis'); // スプレッドシート用
const {
  getSubfolders,
  getProcessedSubfolders,
  getRecordImages,
  renameFolder,
  getDriveImageStream,
  getDriveImageBuffer
} = require('../services/googleDriveService');
const { analyzeRecord } = require('../services/openAiService');

// --- Google Sheets APIのセットアップ ---
const sheets = google.sheets('v4');
const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
google.options({ auth });

// スプレッドシートからカテゴリーを取得する関数
async function getGoogleSheetData() {
    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: '1pGXjlYl29r1KIIPiIu0N4gXKdGquhIZe3UjH_QApwfA',
            range: 'Category-レコード!A2:B',
        });
        const rows = res.data.values;
        if (rows && rows.length) {
            return rows.filter(row => row[0] && row[0].trim() !== '').map(row => ({ name: row[0], code: row[1] }));
        }
        return [];
    } catch (err) {
        console.error('The API returned an error: ' + err);
        throw new Error('Could not retrieve data from Google Sheet.');
    }
}

// ①送料のプルダウン & ②送料のスプシ出力時の変更
// スプレッドシートから送料を取得する関数（値をそのまま返す）
async function getShippingOptionsFromGoogleSheet() {
    try {
        const res = await sheets.spreadsheets.values.get({
            spreadsheetId: '1pGXjlYl29r1KIIPiIu0N4gXKdGquhIZe3UjH_QApwfA',
            range: '送料管理!A2:A',
        });
        const rows = res.data.values;
        if (rows && rows.length) {
            return rows.flat().filter(row => row && row.trim() !== '');
        }
        return [];
    } catch (err) {
        console.error('The API returned an error: ' + err);
        throw new Error('Could not retrieve shipping options from Google Sheet.');
    }
}


/* ──────────────────────────
 * HTML description template
 * ────────────────────────── */
const descriptionTemplate = ({ ai, user }) => {
  const obiStatus = user.obi !== 'なし' ? user.obi : 'Not Included';
  const damageMap = {
    '上部(下部)の裂け': 'Seam Split',
    '角潰れ': 'Corner Dings',
    'シワ': 'Creases',
    'シミ': 'Stains',
    'ラベル剥がれ': 'Sticker Damage'
  };
  const damageList = (user.jacketDamage ?? [])
    .map(d => `- ${damageMap[d] || d}`)
    .join('<br>');

  let tracklistHtml = '';
  if (ai && ai.Tracklist) {
    let listItems = '';
    const tracklist = ai.Tracklist;

    if (typeof tracklist === 'object' && !Array.isArray(tracklist) && Object.keys(tracklist).length > 0) {
        listItems = Object.entries(tracklist)
            .map(([key, value]) => `<li style="line-height: 1.8;"><strong>${key}</strong> ${value || ''}</li>`)
            .join('');
    }
    else if (Array.isArray(tracklist) && tracklist.every(item => typeof item === 'string')) {
        listItems = tracklist.map(track => `<li style="line-height: 1.8;">${track}</li>`).join('');
    }
    else if (typeof tracklist === 'string') {
        listItems = tracklist.split('\n').filter(line => line.trim() !== '').map(line => `<li style="line-height: 1.8;">${line.trim()}</li>`).join('');
    }

    if (listItems) {
        tracklistHtml = `
          <h2 style="font-size: 20px; border-bottom: 2px solid #ccc; padding-bottom: 10px; margin-top: 40px;">Tracklist</h2>
          <div style="column-count: 2; column-gap: 40px;">
            <ul style="list-style: none; padding: 0; margin: 0;">
              ${listItems}
            </ul>
          </div>`;
    }
  }

  let commentHtml = '';
  if (user.comment) {
      commentHtml = `
        <h2 style="font-size: 20px; border-bottom: 2px solid #ccc; padding-bottom: 10px; margin-top: 40px;">Comment</h2>
        <p>${user.comment.replace(/\n/g, '<br>')}</p>
      `;
  }

  return `
  <div style="font-family: Arial, sans-serif; max-width: 900px; margin: auto;">
    <h1 style="font-size: 24px; border-bottom: 2px solid #ccc; padding-bottom: 10px;">
      ${user.title || ai.Title || ''}
    </h1>
    <p style="margin: 16px 0;">
      Our records are pre-owned. Please note that they may have wear, odor, or other signs of aging.<br><br>
      Only purchase if you understand and accept these conditions.
    </p>
    <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
      <tbody>
        <tr>
          <td style="vertical-align: top; padding-right: 20px;">
            <h2 style="font-size: 20px;">Key Features</h2>
            <ul style="list-style: none; padding: 0; line-height: 1.8;">
              <li>- <strong>Brand:</strong> ${ai.RecordLabel || 'Not specified'}</li>
              <li>- <strong>Artist:</strong> ${ai.Artist || 'Not specified'}</li>
              <li>- <strong>Product Type:</strong> Record</li>
              <li>- <strong>Format:</strong> ${ai.Format || 'Not specified'}</li><br>
              <li>- <strong>Condition:</strong></li>
              <li>&nbsp;&nbsp;• Sleeve: ${user.conditionSleeve || ''}</li>
              <li>&nbsp;&nbsp;• Vinyl: ${user.conditionVinyl || ''}</li>
              <li>&nbsp;&nbsp;• OBI Strip: ${obiStatus}</li><br>
              <li>- <strong>Jacket Damage:</strong><br>${damageList || 'None'}</li>
            </ul>
          </td>
          <td style="width: 300px; vertical-align: top;">
            <h2 style="font-size: 20px;">Specifications</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tbody>
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Brand</td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee;">${ai.RecordLabel || ''}</td>
                </tr>
                <tr>
                  <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Country</td>
                  <td style="padding: 8px; border-bottom: 1px solid #eee;">${ai.Country || ''}</td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      </tbody>
    </table>
    ${tracklistHtml}
    ${commentHtml}
    <h2 style="font-size: 20px; border-bottom: 2px solid #ccc; padding-bottom: 10px; margin-top: 40px;">Description</h2>
    <p>If you have any questions, feel free to contact us.<br>All my products are 100% Authentic.</p>
    <h2 style="font-size: 20px; border-bottom: 2px solid #ccc; padding-bottom: 10px; margin-top: 40px;">Shipping</h2>
    <p>
      Shipping by FedEx, DHL, or Japan Post.<br><br>
      When shipping with Japan Post, the delivery date may be later than the estimated date shown on eBay. Delays are unpredictable.<br><br>
      Sometimes the post office may hold the package and not send it. They may not contact you or leave a notice, so please keep trying to reach them.<br><br>
      [Important] If the item does not arrive on time, please do not open a case. Contact me first so I can assist.<br><br>
      When you receive the item, please leave feedback.
    </p>
    <h2 style="font-size: 20px; border-bottom: 2px solid #ccc; padding-bottom: 10px; margin-top: 40px;">International Buyers - Please Note:</h2>
    <p>Import duties, taxes and charges are not included in the item price or shipping charges and are the buyer’s responsibility.</p>
  </div>`.replace(/\r?\n|\r/g, '').replace(/\s\s+/g, ' ').trim();
};

const getFormattedDate = () => {
  const d = new Date();
  return `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
};

/* ──────────────────────────
 * CSV builder
 * ────────────────────────── */
const getSortKey = (name) => {
    const nameUpper = name.toUpperCase();
    let group = 99;
    let number = 0;
    const match = nameUpper.match(/^([MJR])(\d*)_/);
    if (match) {
        const letter = match[1];
        const numStr = match[2];
        if (letter === 'M') group = 1;
        if (letter === 'J') group = 2;
        if (letter === 'R') group = 3;
        number = numStr ? parseInt(numStr, 10) : 0;
    }
    return { group, number };
};

const generateCsv = records => {
  const header = [
    "Action(CC=Cp1252)","CustomLabel","StartPrice","ConditionID","Title","Description",
    "C:Brand","PicURL","UPC","Category","PayPalAccepted","PayPalEmailAddress",
    "PaymentProfileName","ReturnProfileName","ShippingProfileName","Country","Location",
    "StoreCategory","Apply Profile Domestic","Apply Profile International",
    "BuyerRequirements:LinkedPayPalAccount","Duration","Format","Quantity","Currency",
    "SiteID","C:Country","BestOfferEnabled","C:Artist","C:Material","C:Release Title",
    "C:Genre","C:Type","C:Record Label","C:Color","C:Record Size","C:Style","C:Format",
    "C:Release Year","C:Record Grading","C:Sleeve Grading","C:Inlay Condition",
    "C:Case Type","C:Edition","C:Speed","C:Features","C:Country/Region of Manufacture",
    "C:Language","C:Occasion","C:Instrument","C:Era","C:Producer","C:Fidelity Level",
    "C:Composer","C:Conductor","C:Performer Orchestra","C:Run Time","C:MPN",
    "C:California Prop 65 Warning","C:Catalog Number","C:Number of Audio Channels",
    "C:Unit Quantity","C:Unit Type","C:Vinyl Matrix Number", "Created categories"
  ];
  const headerRow = header.map(h => `"${h.replace(/"/g, '""')}"`).join(',');

  const rows = records.filter(r => r.status === 'saved').map(r => {
    const { aiData: ai, userInput: user } = r;
    const row = Array(header.length).fill('');

    const picURL = [...r.images]
      .sort((a, b) => {
          const keyA = getSortKey(a.name);
          const keyB = getSortKey(b.name);
          if (keyA.group !== keyB.group) return keyA.group - keyB.group;
          return keyA.number - keyB.number;
      })
      .map(img => img.url)
      .join('|');

    const baseTitle = user.title || (ai.Title && ai.Artist ? `${ai.Title} ${ai.Artist}` : ai.Title || '');
    const finalTitle = (user.obi && user.obi !== 'なし')
      ? (baseTitle.includes('w/OBI') ? baseTitle : `${baseTitle} w/OBI`)
      : baseTitle;

    // ②送料のスプシ出力時の変更（ユーザーが選択した送料をそのまま使用）
    const shippingProfile = user.shipping || '';

    row[0]  = 'Add';
    row[1]  = r.customLabel;
    row[2]  = user.price || ''; // ③価格はフロントエンドで処理済みの値を使用
    row[3]  = user.productCondition === '新品' ? '1000' : '3000';
    row[4]  = finalTitle;
    row[5]  = descriptionTemplate({ ai, user });
    row[6]  = ai.RecordLabel || '';
    row[7]  = picURL;
    row[9]  = '176985';
    row[10] = '1';
    row[11] = 'payAddress';
    row[12] = 'buy it now';
    row[13] = 'Seller 60days';
    row[14] = shippingProfile; // ここに送料が入る
    row[15] = 'JP';
    row[16] = '417-0816, Fuji Shizuoka';
    row[17] = user.category || '';
    row[18] = '0';
    row[19] = '0';
    row[20] = '0';
    row[21] = 'GTC';
    row[22] = 'FixedPriceItem';
    row[23] = '1';
    row[24] = 'USD';
    row[25] = 'US';
    row[26] = ai.Country || '';
    row[27] = '0';
    row[28] = ai.Artist || '';
    row[29] = ai.Material || '';
    row[30] = finalTitle;
    row[31] = ai.Genre || '';
    row[33] = ai.RecordLabel || '';
    row[36] = ai.Style || '';
    row[37] = ai.Format || '';
    row[38] = ai.Released || '';
    row[39] = user.conditionVinyl  || '';
    row[40] = user.conditionSleeve || '';
    row[46] = 'Japan';
    row[60] = ai.CatalogNumber || '';
    row[66] = '';

    return row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',');
  });

  return [headerRow, ...rows].join('\n');
};

/* ──────────────────────────
 * Router factory
 * ────────────────────────── */
module.exports = sessions => {
  const router = express.Router();

  router.get('/image/:fileId', async (req, res) => {
    try {
      (await getDriveImageStream(req.params.fileId)).pipe(res);
    } catch {
      res.status(500).send('Error fetching image');
    }
  });

  router.post('/process', async (req, res) => {
    const { parentFolderUrl, defaultCategory } = req.body;
    if (!parentFolderUrl) return res.redirect('/');
    const parentFolderId = parentFolderUrl.split('/folders/')[1]?.split('?')[0];
    if (!parentFolderId) return res.status(400).send('Invalid Folder URL');

    const sessionId = uuidv4();
    const shippingOptions = await getShippingOptionsFromGoogleSheet();
    sessions.set(sessionId, { status: 'processing', records: [], categories: [], shippingOptions: shippingOptions, defaultCategory: defaultCategory });
    res.render('results', { sessionId: sessionId, defaultCategory: defaultCategory, shippingOptions: shippingOptions });

    try {
      const [unproc, proc, categories] = await Promise.all([
        getSubfolders(parentFolderId),
        getProcessedSubfolders(parentFolderId),
        getGoogleSheetData()
      ]);
      const session = sessions.get(sessionId);
      session.categories = categories;

      let counter = proc.length;
      const dateStr = getFormattedDate();

      session.records = unproc.map(f => ({
        id: uuidv4(),
        folderId: f.id,
        originalFolderName: f.name,
        status: 'pending',
        customLabel: `R${dateStr}_${String(++counter).padStart(4, '0')}`
      }));

      for (const rec of session.records) {
        try {
          const imgs = (await getRecordImages(rec.folderId)).map(img => ({
            ...img,
            url: `https://drive.google.com/uc?export=download&id=${img.id}`
          }));

          const analysisImages = imgs.filter(img =>
              img.name.toUpperCase().startsWith('J1_') ||
              img.name.toUpperCase().startsWith('J2_') ||
              img.name.toUpperCase().startsWith('R1_')
          );

          const buf = [];
          for (const img of analysisImages) {
            try { buf.push(await getDriveImageBuffer(img.id)); } catch {}
          }
          if (!buf.length) throw new Error('No images for analysis downloaded.');

          const aiData = await analyzeRecord(buf);
          Object.assign(rec, { images: imgs, aiData, status: 'success' });
        } catch (err) {
          Object.assign(rec, { status: 'error', error: err.message });
        }
      }
      session.status = 'completed';
    } catch (err) {
      const s = sessions.get(sessionId);
      s.status = 'error';
      s.error = err.message;
    }
  });

  router.post('/save/:sessionId/:recordId', async (req, res) => {
    const { sessionId, recordId } = req.params;
    const session = sessions.get(sessionId);
    const rec = session?.records.find(r => r.id === recordId);
    if (!rec) return res.status(404).json({ error: 'Record not found' });

    rec.userInput = {
      title:            req.body.title,
      price:            req.body.price,
      shipping:         req.body.shipping,
      productCondition: req.body.productCondition,
      conditionSleeve:  req.body.conditionSleeve,
      conditionVinyl:   req.body.conditionVinyl,
      obi:              req.body.obi,
      jacketDamage:     req.body.jacketDamage || [],
      comment:          req.body.comment,
      category:         req.body.category,
    };
    rec.status = 'saved';

    await renameFolder(rec.folderId, `済 ${rec.originalFolderName}`);
    res.json({ status: 'ok' });
  });

  router.get('/', async (req, res) => {
    try {
        const categories = await getGoogleSheetData();
        res.render('index', { categories: categories });
    } catch (error) {
        console.error(error);
        res.status(500).send("カテゴリーの読み込みに失敗しました。");
    }
  });

  router.get('/status/:sessionId', (req, res) =>
    res.json(sessions.get(req.params.sessionId) || { status: 'error', error: 'Session not found' })
  );

  router.get('/csv/:sessionId', (req, res) => {
    const session = sessions.get(req.params.sessionId);
    if (!session?.records) return res.status(404).send('Session not found');

    const d = new Date();
    const fileName = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.csv`;

    res.header('Content-Type', 'text/csv; charset=UTF-8');
    res.attachment(fileName);
    res.send('\uFEFF' + generateCsv(session.records));
  });

  return router;
};
