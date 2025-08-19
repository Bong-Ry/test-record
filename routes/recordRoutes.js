const express = require('express');
const { v4: uuidv4 } = require('uuid');
const driveService = require('../services/googleDriveService');
const aiService = require('../services/openAiService');
const { uploadPictureFromBuffer } = require('../services/ebayService');

const descriptionTemplate = ({ aiData, userInput }) => {
    const tracklistHtml = aiData.Tracklist
        ? Object.entries(aiData.Tracklist).map(([key, track]) => `<li>${key}: ${track}</li>`).join('')
        : '<li>N/A</li>';

    const jacketDamageText = userInput.jacketDamage?.length > 0 ? `Jacket damages: ${userInput.jacketDamage.join(', ')}` : '';

    return `
    <div style="font-family: Arial, sans-serif; max-width: 1000px;">
        <h1 style="color: #1e3a8a;">${userInput.title}</h1>
        <div style="display: flex; flex-wrap: wrap; margin-top: 20px;">
            <div style="flex: 1; min-width: 300px; padding: 10px;">
                <h2 style="color: #2c5282;">Condition</h2>
                <ul>
                    <li>Sleeve: ${userInput.conditionSleeve}</li>
                    <li>Vinyl: ${userInput.conditionVinyl}</li>
                    <li>OBI: ${userInput.obi}</li>
                </ul>
                <h2 style="color: #2c5282;">Key Features</h2>
                <ul>
                    <li>Artist: ${aiData.Artist || 'N/A'}</li>
                    <li>Format: ${aiData.Format || 'Vinyl'}</li>
                    <li>Genre: ${aiData.Genre || 'N/A'}</li>
                    <li>${jacketDamageText}</li>
                    <li>${userInput.comment || ''}</li>
                </ul>
            </div>
            <div style="flex: 1; min-width: 300px; padding: 10px;">
                <h2 style="color: #2c5282;">Tracklist</h2>
                <ol>${tracklistHtml}</ol>
            </div>
        </div>
        <div style="margin-top: 20px;">
            <h2 style="color: #2c5282;">Product Description</h2><p>If you have any questions, please feel free to ask us.</p>
            <h2 style="color: #2c5282;">Shipping</h2><p>Shipping by FedEx, DHL, or EMS.</p>
            <h2 style="color: #2c5282;">International Buyers - Please Note:</h2><p>Import duties, taxes, and charges are not included. These charges are the buyer's responsibility.</p>
        </div>
    </div>`.replace(/\s{2,}/g, ' ').replace(/\n/g, '');
};

const generateCsv = (records) => {
    const headers = ["Action(CC=Cp1252)", "CustomLabel", "StartPrice", "ConditionID", "Title", "Description", "C:Brand", "PicURL", "Category", "ShippingProfileName", "Duration", "Format", "Quantity", "Country", "Location", "C:Artist", "C:Record Label", "C:Music Genre", "C:Speed", "C:Record Size", "C:Material", "C:Record Grading", "C:Sleeve Grading", "C:Features", "C:Release Year"];
    const headerRow = headers.join(',');

    const rows = records.filter(r => r.status === 'saved').map(r => {
        const { aiData, userInput, picURL, customLabel } = r;
        const titleParts = [aiData.Artist, aiData.Title];
        if (userInput.obi !== 'なし' && userInput.obi !== 'Not Applicable') titleParts.push('w/OBI');

        const features = [];
        if (userInput.obi !== 'なし' && userInput.obi !== 'Not Applicable') features.push('Obi');
        if (aiData.Format?.includes('Reissue')) features.push('Reissue');

        const data = {
            "Action(CC=Cp1252)": "Add", "CustomLabel": customLabel, "StartPrice": userInput.price,
            "ConditionID": userInput.productCondition === '新品' ? 1000 : 3000, "Title": titleParts.join(' '),
            "Description": descriptionTemplate({ aiData, userInput }), "C:Brand": aiData.RecordLabel || "No Brand",
            "PicURL": picURL, "Category": userInput.category,
            "ShippingProfileName": userInput.shipping, "Duration": "GTC", "Format": "FixedPrice",
            "Quantity": 1, "Country": "JP", "Location": "Fuji, Shizuoka",
            "C:Artist": aiData.Artist, "C:Record Label": aiData.RecordLabel, "C:Music Genre": aiData.Genre,
            "C:Speed": "33 RPM", "C:Record Size": "12\"", "C:Material": "Vinyl",
            "C:Record Grading": userInput.conditionVinyl, "C:Sleeve Grading": userInput.conditionSleeve,
            "C:Features": features.join('|'), "C:Release Year": aiData.Released,
        };
        return headers.map(h => `"${(data[h] || '').toString().replace(/"/g, '""')}"`).join(',');
    });
    return [headerRow, ...rows].join('\r\n');
};

module.exports = (sessions) => {
    const router = express.Router();

    router.get('/', async (req, res) => {
        try {
            const categories = await driveService.getStoreCategories();
            res.render('index', { categories });
        } catch (error) {
            console.error(error);
            res.render('index', { categories: [] });
        }
    });

    router.post('/process', async (req, res) => {
        const { parentFolderUrl, defaultCategory } = req.body;
        if (!parentFolderUrl) return res.redirect('/');

        const sessionId = uuidv4();

        try {
            const shippingOptions = await driveService.getShippingOptions();
            const categories = await driveService.getStoreCategories();

            sessions.set(sessionId, {
                status: 'processing',
                records: [],
                shippingOptions,
                categories,
            });

            res.render('results', { sessionId, defaultCategory, shippingOptions });

        } catch (error) {
            console.error("Failed to fetch initial data from Spreadsheet:", error);
            const errorMessage = 'スプレッドシートからの初期データ取得に失敗しました。';
            sessions.set(sessionId, { status: 'error', error: errorMessage, records: [] });
            res.render('results', { sessionId, defaultCategory: '', shippingOptions: [], error: errorMessage });
            return;
        }

        (async () => {
            const session = sessions.get(sessionId);
            try {
                const folderIdMatch = parentFolderUrl.match(/folders\/([a-zA-Z0-9_-]+)/);
                if (!folderIdMatch) throw new Error('無効なGoogle DriveフォルダURLです。');
                const parentFolderId = folderIdMatch[1];
                
                const subfolders = await driveService.getSubfolders(parentFolderId);
                if (subfolders.length === 0) throw new Error('処理対象のフォルダが見つかりません。');
                
                const processedCount = (await driveService.getProcessedSubfolders(parentFolderId)).length;
                const d = new Date();
                const datePrefix = `R${d.getFullYear().toString().slice(-2)}${(d.getMonth() + 1).toString().padStart(2, '0')}${d.getDate().toString().padStart(2, '0')}`;

                session.records = subfolders.map((f, index) => ({
                    id: uuidv4(),
                    folderId: f.id,
                    folderName: f.name,
                    status: 'pending',
                    customLabel: `${datePrefix}_${(processedCount + index + 1).toString().padStart(4, '0')}`
                }));

                for (const record of session.records) {
                    try {
                        const imageFiles = await driveService.getRecordImages(record.folderId);
                        if (imageFiles.length === 0) throw new Error('フォルダ内に画像がありません。');
                        
                        const imageBuffers = await Promise.all(
                            imageFiles.map(file => driveService.getDriveImageBuffer(file.id))
                        );
                        
                        record.aiData = await aiService.analyzeRecord(imageBuffers);
                        
                        const j1Image = imageFiles.find(img => img.name.toUpperCase().startsWith('J1'));
                        const mainImageToUpload = j1Image || imageFiles[0];
                        const mainImageIndex = imageFiles.findIndex(f => f.id === mainImageToUpload.id);
                        const mainImageBuffer = imageBuffers[mainImageIndex];
                        
                        record.picURL = await uploadPictureFromBuffer(mainImageBuffer, { pictureName: record.customLabel });
                        record.images = imageFiles.map(f => ({ id: f.id, name: f.name }));
                        record.status = 'success';

                    } catch (err) {
                        console.error(`Error processing record ${record.customLabel}:`, err);
                        record.status = 'error';
                        record.error = err.message;
                    }
                }
                session.status = 'completed';
            } catch (err) {
                console.error(`Fatal error in processing session:`, err);
                session.status = 'error';
                session.error = err.message;
            }
        })();
    });

    router.get('/status/:sessionId', (req, res) => {
        res.json(sessions.get(req.params.sessionId) || { status: 'error', error: 'Session not found' });
    });

    router.post('/save/:sessionId/:recordId', async (req, res) => {
        const { sessionId, recordId } = req.params;
        const session = sessions.get(sessionId);
        const record = session?.records.find(r => r.id === recordId);
        if (!record) return res.status(404).json({ error: 'Record not found' });
        
        record.userInput = req.body;
        record.status = 'saved';
        
        await driveService.renameFolder(record.folderId, `済 ${record.folderName}`);
        res.json({ status: 'ok' });
    });

    router.get('/csv/:sessionId', (req, res) => {
        const session = sessions.get(req.params.sessionId);
        if (!session) return res.status(404).send('Session not found');
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const fileName = `Records_${date}.csv`;
        res.header('Content-Type', 'text/csv; charset=UTF-8');
        res.attachment(fileName);
        res.send('\uFEFF' + generateCsv(session.records));
    });

    router.get('/image/:fileId', async (req, res) => {
        try {
            const imageStream = await driveService.getDriveImageStream(req.params.fileId);
            imageStream.pipe(res);
        } catch (error) {
            console.error('Image fetch error:', error);
            res.status(404).send('Image not found');
        }
    });

    return router;
};
