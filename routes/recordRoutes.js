const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getRecordImages, getDriveImageStream } = require('../services/googleDriveService');
const { analyzeRecord } = require('../services/openAiService');

// ご指示のあった新しいHTMLテンプレートに差し替え
const descriptionTemplate = (data) => {
    const obiStatus = data.user.obi !== 'なし' ? data.user.obi : 'Not Included';

    let damageList = '';
    if (data.user.jacketDamage && data.user.jacketDamage.length > 0) {
        const damageMap = {
            '上部(下部)の裂け': 'Seam Split', '角潰れ': 'Corner Dings', 'シワ': 'Creases', 'シミ': 'Stains', 'ラベル剥がれ': 'Sticker Damage'
        };
        damageList = data.user.jacketDamage.map(d => `- ${damageMap[d] || d}`).join('<br>');
    }

    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 900px; margin: auto;">
        <h1 style="font-size: 24px; border-bottom: 2px solid #ccc; padding-bottom: 10px;">
            ${data.ai.Title || ''}
        </h1>
        <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <tbody>
                <tr>
                    <td style="vertical-align: top; padding-right: 20px;">
                        <h2 style="font-size: 20px;">Key Features</h2>
                        <ul style="list-style: none; padding: 0; line-height: 1.8;">
                            <li>- <strong>Brand:</strong> ${data.ai.RecordLabel || 'Not specified'}</li>
                            <li>- <strong>Artist:</strong> ${data.ai.Artist || 'Not specified'}</li>
                            <li>- <strong>Product Type:</strong> Record</li>
                            <li>- <strong>Format:</strong> ${data.ai.Format || 'Not specified'}</li>
                            <br>
                            <li>- <strong>Condition:</strong></li>
                            <li>&nbsp;&nbsp;• Sleeve: ${data.user.conditionSleeve || ''}</li>
                            <li>&nbsp;&nbsp;• Vinyl: ${data.user.conditionVinyl || ''}</li>
                            <li>&nbsp;&nbsp;• OBI Strip: ${obiStatus}</li>
                            <br>
                            <li>- <strong>Jacket Damage:</strong><br>${damageList || 'None'}</li>
                        </ul>
                    </td>
                    <td style="width: 300px; vertical-align: top;">
                        <h2 style="font-size: 20px;">Specifications</h2>
                        <table style="width: 100%; border-collapse: collapse;">
                            <tbody>
                                <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Brand</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.ai.RecordLabel || ''}</td></tr>
                                <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Country</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.ai.Country || ''}</td></tr>
                            </tbody>
                        </table>
                    </td>
                </tr>
            </tbody>
        </table>
        <h2 style="font-size: 20px; border-bottom: 2px solid #ccc; padding-bottom: 10px; margin-top: 40px;">Description</h2>
        <p>If you have any questions, feel free to contact us.<br>All my products are 100% Authentic.</p>
        <h2 style="font-size: 20px; border-bottom: 2px solid #ccc; padding-bottom: 10px; margin-top: 40px;">Shipping</h2>
        <p>Shipping by FedEx, DHL, or Japan post.<br><br>When shipping with Japan Post, the delivery date may be later than the estimated date shown on eBay. Delays are unpredictable.<br><br>Sometimes, the post office may hold onto the package and not send it. They may not contact you or leave a notice, so please continue to reach out until you get through to them.<br><br>[ Important ] If the item does not arrive on time, please do not open a case. Contact me first, and I will support you to ensure your satisfaction. (Once a case is opened, I won't be able to assist you at all.)<br><br>When you receive the item, please leave feedback.</p>
        <h2 style="font-size: 20px; border-bottom: 2px solid #ccc; padding-bottom: 10px; margin-top: 40px;">International Buyers - Please Note:</h2>
        <p>Import duties, taxes and charges are not included in the item price or shipping charges. These charges are the buyer’s responsibility. Please check with your country’s customs office to determine what these additional costs will be prior to bidding/buying. These charges are normally collected by the delivering freight (shipping) company or when you pick the item up - do not confuse them for additional shipping charges. We do not mark merchandise values below value or mark items as "gifts" - US and International government regulations prohibit such behavior.</p>
    </div>
    `;
    return html.replace(/\r?\n|\r/g, "").replace(/\s\s+/g, ' ').trim();
};

const getFormattedDate = () => {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}${mm}${dd}`;
};

const generateCsv = (records) => {
    // ご提示いただいた68列のヘッダーをそのまま使用
    const header = ["Action(CC=Cp1252)","CustomLabel","StartPrice","ConditionID","Title","Description","C:Brand","PicURL","UPC","Category","PayPalAccepted","PayPalEmailAddress","PaymentProfileName","ReturnProfileName","ShippingProfileName","Country","Location","StoreCategory","Apply Profile Domestic","Apply Profile International","BuyerRequirements:LinkedPayPalAccount","Duration","Format","Quantity","Currency","SiteID","C:Country","BestOfferEnabled","C:Artist","C:Material","C:Release Title","C:Genre","C:Type","C:Record Label","C:Color","C:Record Size","C:Style","C:Format","C:Release Year","C:Record Grading","C:Sleeve Grading","C:Inlay Condition","C:Case Type","C:Edition","C:Speed","C:Features","C:Country/Region of Manufacture","C:Language","C:Occasion","C:Instrument","C:Era","C:Producer","C:Fidelity Level","C:Composer","C:Conductor","C:Performer Orchestra","C:Run Time","C:MPN","C:California Prop 65 Warning","C:Catalog Number","C:Number of Audio Channels","C:Unit Quantity","C:Unit Type","C:Vinyl Matrix Number","__keyValuePairs"];
    const headerRow = header.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');

    let recordCounter = 0;

    const dataRows = records
        .filter(record => record.status === 'saved')
        .map(record => {
            recordCounter++;
            const row = Array(header.length).fill('NA'); // ご指示通りNAで埋めます
            const ai = record.aiData;
            const user = record.userInput;

            const customLabel = `R${getFormattedDate()}_${String(recordCounter).padStart(4, '0')}`;

            const sortOrder = { 'J1_': 1, 'J2_': 2, 'R1_': 3 };
            const sortedImages = [...record.images].sort((a, b) => {
                const aPrefix = a.name.substring(0, 3);
                const bPrefix = b.name.substring(0, 3);
                const aOrder = sortOrder[aPrefix] || 4;
                const bOrder = sortOrder[bPrefix] || 4;
                return aOrder - bOrder;
            });
            const picURL = sortedImages.map(img => img.url).join('|');

            const shippingProfileName = user.shipping ? `#${user.shipping}-DHL FedEx 00.00 - 06.50kg` : '';

            const descriptionHtml = descriptionTemplate({ ai, user });

            // ご提示いただいたコードのデータマッピングを維持
            row[0] = 'Add';
            row[1] = customLabel;
            row[2] = user.price || '';
            row[3] = '3000';
            row[4] = ai.Title || '';
            row[5] = descriptionHtml;
            row[6] = ai.RecordLabel || '';
            row[7] = picURL;
            row[9] = '176985';
            row[10] = '1';
            row[11] = 'payAddress';
            row[12] = 'buy it now';
            row[13] = 'Seller 60days';
            row[14] = shippingProfileName;
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
            row[30] = ai.Title || '';
            row[31] = ai.Genre || '';
            row[33] = ai.RecordLabel || '';
            row[36] = ai.Style || '';
            row[37] = ai.Format || '';
            row[38] = ai.Released || '';
            row[39] = user.conditionVinyl || '';
            row[40] = user.conditionSleeve || '';
            row[46] = 'Japanese (with Obi strip)';
            row[60] = ai.CatalogNumber || '';

            return row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
        });

    return [headerRow, ...dataRows].join('\n');
};

module.exports = (sessions) => {
    const router = express.Router();

    router.get('/image/:fileId', async (req, res) => {
        try {
            const { fileId } = req.params;
            const imageStream = await getDriveImageStream(fileId);
            imageStream.pipe(res);
        } catch (error) {
            console.error('Proxy Error:', error);
            res.status(500).send('Error fetching image');
        }
    });

    router.post('/process', (req, res) => {
        const folderUrls = req.body.folderUrls.filter(url => url.trim() !== '');
        if (folderUrls.length === 0) { return res.redirect('/'); }
        const sessionId = uuidv4();
        const records = [];
        sessions.set(sessionId, { status: 'processing', records: records });
        res.render('results', { sessionId: sessionId });
        (async () => {
            for (const url of folderUrls) {
                const folderId = url.split('/folders/')[1];
                let record = { id: uuidv4(), status: 'pending' };
                sessions.get(sessionId).records.push(record);
                try {
                    const images = await getRecordImages(folderId);
                    const aiData = await analyzeRecord(images.map(img => img.url));
                    Object.assign(record, { images, aiData, status: 'success' });
                } catch (error) {
                    Object.assign(record, { error: error.message, status: 'error' });
                }
            }
            sessions.get(sessionId).status = 'completed';
        })();
    });

    router.post('/save/:sessionId/:recordId', (req, res) => {
        const { sessionId, recordId } = req.params;
        const session = sessions.get(sessionId);
        const record = session.records.find(r => r.id === recordId);
        if (!record) return res.status(404).json({ error: 'Record not found' });
        record.userInput = {
            price: req.body.price,
            shipping: req.body.shipping,
            conditionSleeve: req.body.conditionSleeve,
            conditionVinyl: req.body.conditionVinyl,
            obi: req.body.obi,
            jacketDamage: req.body.jacketDamage || [],
            comment: req.body.comment
        };
        record.status = 'saved';
        res.json({ status: 'ok' });
    });

    router.get('/', (req, res) => res.render('index'));

    router.get('/status/:sessionId', (req, res) => {
        const session = sessions.get(req.params.sessionId);
        res.json(session || { status: 'error', error: 'Session not found' });
    });

    router.get('/csv/:sessionId', (req, res) => {
        const { sessionId } = req.params;
        const session = sessions.get(sessionId);
        if (!session || !session.records) { return res.status(404).send('Session not found'); }
        const csvData = generateCsv(session.records);
        res.header('Content-Type', 'text/csv; charset=UTF-8');
        res.send('\uFEFF' + csvData);
    });

    return router;
};
