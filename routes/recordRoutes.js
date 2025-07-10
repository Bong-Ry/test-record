const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getSubfolders, getRecordImages, renameFolder, getDriveImageStream } = require('../services/googleDriveService');
const { analyzeRecord } = require('../services/openAiService');

const descriptionTemplate = (data) => {
    const obiStatus = data.user.obi !== 'なし' ? data.user.obi : 'Not Included';

    let damageList = '';
    if (data.user.jacketDamage && data.user.jacketDamage.length > 0) {
        const damageMap = {
            '上部(下部)の裂け': 'Seam Split', '角潰れ': 'Corner Dings', 'シワ': 'Creases', 'シミ': 'Stains', 'ラベル剥がれ': 'Sticker Damage'
        };
        const items = data.user.jacketDamage.map(d => `<li>${damageMap[d] || d}</li>`).join('');
        damageList = `<strong>Jacket Damage:</strong><ul style="margin-top: 5px; padding-left: 20px;">${items}</ul>`;
    }

    const html = `
    <div style="font-family: Arial, sans-serif; padding: 10px; line-height: 1.6;">
        <h2 style="border-bottom: 2px solid #333; padding-bottom: 5px;">Description</h2>
        <ul style="list-style: none; padding: 0;">
            <li><strong>Artist:</strong> ${data.ai.Artist || ''}</li>
            <li><strong>Title:</strong> ${data.user.title || data.ai.Title || ''}</li>
            <li><strong>Format:</strong> ${data.ai.Format || ''}</li>
            <li><strong>Label:</strong> ${data.ai.RecordLabel || ''}</li>
            <li><strong>Country:</strong> ${data.ai.Country || ''}</li>
            <li><strong>Released:</strong> ${data.ai.Released || ''}</li>
            <li><strong>Genre:</strong> ${data.ai.Genre || ''}</li>
            <br>
            <li><strong>Condition (Sleeve):</strong> ${data.user.conditionSleeve || ''}</li>
            <li><strong>Condition (Vinyl):</strong> ${data.user.conditionVinyl || ''}</li>
            <li>${damageList}</li>
            <li><strong>Obi Strip:</strong> ${obiStatus}</li>
            <br>
            <li><strong>Comment:</strong><br>${data.user.comment || ''}</li>
        </ul>
        <h2 style="border-bottom: 2px solid #333; padding-bottom: 5px; margin-top: 30px;">Shipping</h2>
        <p>Shipping by FedEx, DHL, or EMS.</p>
        <h2 style="border-bottom: 2px solid #333; padding-bottom: 5px; margin-top: 30px;">International Buyers - Please Note:</h2>
        <ul style="list-style: none; padding: 0;">
            <li>- Import duties, taxes, and charges are not included in the item price or shipping charges. These charges are the buyer's responsibility.</li>
            <li>- Please check with your country's customs office to determine what these additional costs will be prior to bidding/buying.</li>
        </ul>
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
    const header = ["Action(CC=Cp1252)","CustomLabel","StartPrice","ConditionID","Title","Description","C:Brand","PicURL","UPC","Category","PayPalAccepted","PayPalEmailAddress","PaymentProfileName","ReturnProfileName","ShippingProfileName","Country","Location","StoreCategory","Apply Profile Domestic","Apply Profile International","BuyerRequirements:LinkedPayPalAccount","Duration","Format","Quantity","Currency","SiteID","C:Country","BestOfferEnabled","C:Artist","C:Material","C:Release Title","C:Genre","C:Type","C:Record Label","C:Color","C:Record Size","C:Style","C:Format","C:Release Year","C:Record Grading","C:Sleeve Grading","C:Inlay Condition","C:Case Type","C:Edition","C:Speed","C:Features","C:Country/Region of Manufacture","C:Language","C:Occasion","C:Instrument","C:Era","C:Producer","C:Fidelity Level","C:Composer","C:Conductor","C:Performer Orchestra","C:Run Time","C:MPN","C:California Prop 65 Warning","C:Catalog Number","C:Number of Audio Channels","C:Unit Quantity","C:Unit Type","C:Vinyl Matrix Number","__keyValuePairs"];
    const headerRow = header.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');

    let recordCounter = 0;

    const dataRows = records
        .filter(record => record.status === 'saved')
        .map(record => {
            recordCounter++;
            const row = Array(header.length).fill('NA');
            const ai = record.aiData;
            const user = record.userInput;

            const customLabel = `R${getFormattedDate()}_${String(recordCounter).padStart(4, '0')}`;

            const sortOrder = { 'M_': 1, 'J2_': 2, 'R1_': 3 }; // J1_ を M_ に変更
            const sortedImages = [...record.images].sort((a, b) => {
                const aPrefix = a.name.substring(0, 2);
                const bPrefix = b.name.substring(0, 2);
                const aOrder = sortOrder[aPrefix] || 4;
                const bOrder = sortOrder[bPrefix] || 4;
                return aOrder - bOrder;
            });
            const picURL = sortedImages.map(img => img.url).join('|');

            const shippingProfileName = user.shipping ? `#${user.shipping}-DHL FedEx 00.00 - 06.50kg` : '';

            const descriptionHtml = descriptionTemplate({ ai, user });

            const finalTitle = user.title || ai.Title || '';
            const finalSubtitle = user.subtitle || ai.Subtitle || '';

            row[0] = 'Add';
            row[1] = customLabel;
            row[2] = user.price || '';
            row[3] = '3000';
            row[4] = finalTitle;
            row[5] = descriptionHtml;
            row[6] = ai.RecordLabel || '';
            row[7] = picURL;
            row[9] = '176985';
            row[12] = 'buy it now';
            row[13] = 'Seller 60days';
            row[14] = shippingProfileName;
            row[15] = 'JP';
            row[16] = '417-0816, Fuji Shizuoka';
            row[17] = '41903496010';
            row[21] = 'GTC';
            row[22] = 'FixedPriceItem';
            row[23] = '1';
            row[24] = 'USD';
            row[25] = 'US';
            row[26] = ai.Country || '';
            row[28] = ai.Artist || '';
            row[29] = ai.Material || '';
            row[30] = finalTitle;
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
            session.records = subfolders.map(folder => ({
                id: uuidv4(),
                folderId: folder.id,
                originalFolderName: folder.name,
                status: 'pending'
            }));

            for (const record of session.records) {
                try {
                    const images = await getRecordImages(record.folderId);
                    const aiData = await analyzeRecord(images.map(img => img.url));
                    Object.assign(record, { images, aiData, status: 'success' });
                } catch (error) {
                    Object.assign(record, { error: error.message, status: 'error' });
                }
            }
            session.status = 'completed';
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
            subtitle: req.body.subtitle,
            price: req.body.price,
            shipping: req.body.shipping,
            conditionSleeve: req.body.conditionSleeve,
            conditionVinyl: req.body.conditionVinyl,
            obi: req.body.obi,
            jacketDamage: req.body.jacketDamage || [],
            comment: req.body.comment
        };
        record.status = 'saved';

        // フォルダ名を変更
        const newFolderName = `済 ${record.originalFolderName}`;
        await renameFolder(record.folderId, newFolderName);

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
