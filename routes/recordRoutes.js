const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getSubfolders, getRecordImages, renameFolder, getDriveImageStream, getDriveImageBuffer } = require('../services/googleDriveService');
const { analyzeRecord } = require('../services/openAiService');

const descriptionTemplate = (data) => {
    const obiStatus = data.user.obi !== 'なし' ? data.user.obi : 'Not Included';
    
    let damageList = '';
    if (data.user.jacketDamage?.length) {
        const damageMap = {
            '上部(下部)の裂け': 'Seam Split', '角潰れ': 'Corner Dings', 'シワ': 'Creases', 'シミ': 'Stains', 'ラベル剥がれ': 'Sticker Damage',
        };
        damageList = data.user.jacketDamage.map(d => `- ${damageMap[d] || d}`).join('<br>');
    }

    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 900px; margin: auto;">
        <h1 style="font-size: 24px; border-bottom: 2px solid #ccc; padding-bottom: 10px;">
            ${data.user.title || data.ai.Title || ''}
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
        <p>Shipping by FedEx, DHL, or Japan post.<br><br>
            When shipping with Japan Post, the delivery date may be later than the estimated date shown on eBay. Delays are unpredictable.<br><br>
            Sometimes, the post office may hold onto the package and not send it. They may not contact you or leave a notice, so please continue to reach out until you get through to them.<br><br>
            [ Important ] If the item does not arrive on time, please do not open a case. Contact me first so I can assist.<br><br>
            When you receive the item, please leave feedback.</p>
        <h2 style="font-size: 20px; border-bottom: 2px solid #ccc; padding-bottom: 10px; margin-top: 40px;">International Buyers - Please Note:</h2>
        <p>Import duties, taxes and charges are not included in the item price or shipping charges and are the buyer’s responsibility.</p>
    </div>
    `;
    return html.replace(/\r?\n|\r/g, '').replace(/\s\s+/g, ' ').trim();
};

const getFormattedDate = () => {
    const d = new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yy}${mm}${dd}`;
};

const generateCsv = (records) => {
    const header = ["Action(CC=Cp1252)","CustomLabel","StartPrice","ConditionID","Title","Description","C:Brand","PicURL","UPC","Category","PayPalAccepted","PayPalEmailAddress","PaymentProfileName","ReturnProfileName","ShippingProfileName","Country","Location","StoreCategory","Apply Profile Domestic","Apply Profile International","BuyerRequirements:LinkedPayPalAccount","Duration","Format","Quantity","Currency","SiteID","C:Country","BestOfferEnabled","C:Artist","C:Material","C:Release Title","C:Genre","C:Type","C:Record Label","C:Color","C:Record Size","C:Style","C:Format","C:Release Year","C:Record Grading","C:Sleeve Grading","C:Inlay Condition","C:Case Type","C:Edition","C:Speed","C:Features","C:Country/Region of Manufacture","C:Language","C:Occasion","C:Instrument","C:Era","C:Producer","C:Fidelity Level","C:Composer","C:Conductor","C:Performer Orchestra","C:Run Time","C:MPN","C:California Prop 65 Warning","C:Catalog Number","C:Number of Audio Channels","C:Unit Quantity","C:Unit Type","C:Vinyl Matrix Number","__keyValuePairs"];
    const headerRow = header.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',');

    const dataRows = records.filter(r => r.status === 'saved').map(r => {
        const ai = r.aiData, user = r.userInput;
        const row = Array(header.length).fill('NA');

        const sortOrder = { 'M_': 1, 'J1_': 2, 'J2_': 3, 'R1_': 4 };
        const picURL = [...r.images]
            .sort((a, b) => (sortOrder[a.name.slice(0, 2)] || 5) - (sortOrder[b.name.slice(0, 2)] || 5))
            .map(img => img.url).join('|');

        const shippingProfileName = user.shipping ? `#${user.shipping}-DHL FedEx 00.00 - 06.50kg` : '';

        row[0]  = 'Add';
        row[1]  = r.customLabel || ''; // Use generated SKU
        row[2]  = user.price || '';
        row[3]  = '3000';
        row[4]  = user.title || ai.Title || '';
        row[5]  = descriptionTemplate({ ai, user });
        row[6]  = ai.RecordLabel || '';
        row[7]  = picURL;
        row[9]  = '176985';
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
        row[30] = user.title || ai.Title || '';
        row[31] = ai.Genre || '';
        row[33] = ai.RecordLabel || '';
        row[36] = ai.Style || '';
        row[37] = ai.Format || '';
        row[38] = ai.Released || '';
        row[39] = user.conditionVinyl || '';
        row[40] = user.conditionSleeve || '';
        row[46] = user.obi !== 'なし' ? 'Japanese (with Obi strip)' : 'Unknown';
        row[60] = ai.CatalogNumber || '';

        return row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',');
    });

    return [headerRow, ...dataRows].join('\n');
};

module.exports = (sessions) => {
    const router = express.Router();

    router.get('/image/:fileId', async (req, res) => {
        try {
            const stream = await getDriveImageStream(req.params.fileId);
            stream.pipe(res);
        } catch (err) {
            res.status(500).send('Error fetching image');
        }
    });

    router.post('/process', async (req, res) => {
        const parentFolderUrl = req.body.parentFolderUrl;
        if (!parentFolderUrl) { return res.redirect('/'); }
        
        const parentFolderId = parentFolderUrl.split('/folders/')[1];
        if (!parentFolderId) { return res.status(400).send('Invalid Folder URL'); }

        const sessionId = uuidv4();
        sessions.set(sessionId, { status: 'processing', records: [] });
        res.render('results', { sessionId: sessionId });

        try {
            const subfolders = await getSubfolders(parentFolderId);
            const session = sessions.get(sessionId);
            
            let recordCounter = 0; // SKU counter for this session
            const dateStr = getFormattedDate();

            session.records = subfolders.map(folder => {
                recordCounter++;
                return {
                    id: uuidv4(),
                    folderId: folder.id,
                    originalFolderName: folder.name,
                    status: 'pending',
                    customLabel: `R${dateStr}_${String(recordCounter).padStart(4, '0')}`
                };
            });

            for (const record of session.records) {
                try {
                    const images = await getRecordImages(record.folderId);
                    
                    const imageBuffers = [];
                    for (const image of images.slice(0, 3)) {
                        try {
                            const buffer = await getDriveImageBuffer(image.id);
                            imageBuffers.push(buffer);
                        } catch (e) {
                            console.error(`Failed to download image ${image.id}:`, e);
                        }
                    }

                    if (imageBuffers.length === 0) {
                        throw new Error("No images could be downloaded for analysis.");
                    }
                    
                    const aiData = await analyzeRecord(imageBuffers);
                    Object.assign(record, { images, aiData, status: 'success' });

                } catch (error) {
                    Object.assign(record, { error: error.message, status: 'error' });
                }
            }
            sessions.get(sessionId).status = 'completed';
        } catch (error) {
            const session = sessions.get(sessionId);
            session.status = 'error';
            session.error = error.message;
        }
    });

    router.post('/save/:sessionId/:recordId', async (req, res) => {
        const { sessionId, recordId } = req.params;
        const session = sessions.get(sessionId);
        const record = session.records.find(r => r.id === recordId);
        if (!record) return res.status(404).json({ error: 'Record not found' });
        
        record.userInput = {
            title: req.body.title,
            // subtitleを削除
            price: req.body.price,
            shipping: req.body.shipping,
            conditionSleeve: req.body.conditionSleeve,
            conditionVinyl: req.body.conditionVinyl,
            obi: req.body.obi,
            jacketDamage: req.body.jacketDamage || [],
            comment: req.body.comment
        };
        record.status = 'saved';

        const newFolderName = `済 ${record.originalFolderName}`;
        await renameFolder(record.folderId, newFolderName);

        res.json({ status: 'ok' });
    });

    router.get('/', (req, res) => res.render('index'));

    router.get('/status/:sessionId', (req, res) => {
        res.json(sessions.get(req.params.sessionId) || { status: 'error', error: 'Session not found' });
    });

    router.get('/csv/:sessionId', (req, res) => {
        const s = sessions.get(req.params.sessionId);
        if (!s?.records) return res.status(404).send('Session not found');
        
        const d = new Date();
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const fileName = `${yyyy}${mm}${dd}.csv`;

        res.header('Content-Type', 'text/csv; charset=UTF-8');
        res.attachment(fileName);
        res.send('\uFEFF' + generateCsv(s.records));
    });

    return router;
};

