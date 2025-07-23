/* Router: record processing & CSV (eBay) */
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { google } = require('googleapis'); // スプレッドシート用に追加
const {
  getSubfolders,
  getProcessedSubfolders,
  getRecordImages,
  renameFolder,
  getDriveImageStream,
  getDriveImageBuffer
} = require('../services/googleDriveService');
const { analyzeRecord } = require('../services/openAiService');

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
            return rows.map(row => ({ name: row[0], code: row[1] }));
        }
        return [];
    } catch (err) {
        console.error('The API returned an error: ' + err);
        throw new Error('Could not retrieve data from Google Sheet.');
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

  const tracklistHtml = ai.Tracklist && Object.keys(ai.Tracklist).length > 0
    ? `<h2 style="font-size: 20px; border-bottom: 2px solid #ccc; padding-bottom: 10px; margin-top: 40px;">lists</h2>
       <div style="column-count: 2; column-gap: 40px;">
         <ul style="list-style: none; padding: 0; margin: 0;">
           ${Object.entries(ai.Tracklist).map(([key, value]) => `<li style="line-height: 1.8;"><strong>${key}</strong> ${value}</li>`).join('')}
         </ul>
       </div>`
    : '';

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
const prefixKey = n => n.startsWith('M_') ? 'M_' : n.slice(0, 3);
const order = { 'M_': 1, 'J1_': 2, 'J2_': 3, 'R1_': 4 };

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
    "C:Unit Quantity","C:Unit Type","C:Vinyl Matrix Number", "Created categories" // 修正
  ];
  const headerRow = header.map(h => `"${h.replace(/"/g, '""')}"`).join(',');

  const rows = records.filter(r => r.status === 'saved').map(r => {
    const { aiData: ai, userInput: user } = r;
    const row = Array(header.length).fill('');

    const picURL = [...r.images]
      .sort((a, b) => (order[prefixKey(a.name)] || 99) - (order[prefixKey(b.name)] || 99))
      .map(img => img.url)
      .join('|');

    const baseTitle = user.title || ai.Title || '';
    const finalTitle = (user.obi && user.obi !== 'なし')
      ? (baseTitle.includes('w/OBI') ? baseTitle : `${baseTitle} w/OBI`)
      : baseTitle;

    const shippingProfile = user.shipping ? `#${user.shipping}-DHL FedEx 00.00 - 06.50kg` : '';

    row[0]  = 'Add';
    row[1]  = r.customLabel;
    row[2]  = user.price || '';
    row[3]  = '3000';
    row[4]  = finalTitle;
    row[5]  = descriptionTemplate({ ai, user });
    row[6]  = ai.RecordLabel || '';
    row[7]  = picURL;
    row[9]  = user.category || '176985'; // 修正: カテゴリーを使用
    row[10] = '1';
    row[11] = 'payAddress';
    row[12] = 'buy it now';
    row[13] = 'Seller 60days';
    row[14] = shippingProfile;
    row[15] = 'JP';
    row[16] = '417-0816, Fuji Shizuoka';
    row[17] = '41903496010';
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
    row[46] = 'Japan'; // 修正: Japanese -> Japan
    row[60] = ai.CatalogNumber || '';
    row[66] = user.category || '176985'; // 修正: Created categories列

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
    const url = req.body.parentFolderUrl;
    if (!url) return res.redirect('/');
    const parentFolderId = url.split('/folders/')[1]?.split('?')[0];
    if (!parentFolderId) return res.status(400).send('Invalid Folder URL');

    const sessionId = uuidv4();
    sessions.set(sessionId, { status: 'processing', records: [], categories: [] }); // categoriesを追加
    res.render('results', { sessionId });

    try {
      const [unproc, proc, categories] = await Promise.all([ // categoriesを取得
        getSubfolders(parentFolderId),
        getProcessedSubfolders(parentFolderId),
        getGoogleSheetData()
      ]);
      const session = sessions.get(sessionId);
      session.categories = categories; // セッションに保存

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

          const buf = [];
          for (const img of imgs.slice(0, 3)) {
            try { buf.push(await getDriveImageBuffer(img.id)); } catch {}
          }
          if (!buf.length) throw new Error('No images downloaded.');
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
      title:           req.body.title,
      price:           req.body.price,
      shipping:        req.body.shipping,
      conditionSleeve: req.body.conditionSleeve,
      conditionVinyl:  req.body.conditionVinyl,
      obi:             req.body.obi,
      jacketDamage:    req.body.jacketDamage || [],
      comment:         req.body.comment,
      category:        req.body.category, // categoryを追加
    };
    rec.status = 'saved';

    await renameFolder(rec.folderId, `済 ${rec.originalFolderName}`);
    res.json({ status: 'ok' });
  });

  router.get('/', (_req, res) => res.render('index'));

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
