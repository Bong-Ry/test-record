// routes/recordRoutes.js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const driveService = require('../services/googleDriveService');
const aiService = require('../services/openAiService');
const recordService = require('../services/recordService'); // ★修正: eBayアップロード機能を持つサービス

// CSV生成と商品説明のロジック (test-cdlisterから流用)
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
        const { aiData, userInput, picURL, customLabel } = r; // ★修正: ebayImageUrls -> picURL
        const titleParts = [aiData.Artist, aiData.Title];
        if (userInput.obi !== 'なし' && userInput.obi !== 'Not Applicable') titleParts.push('w/OBI');

        const features = [];
        if (userInput.obi !== 'なし' && userInput.obi !== 'Not Applicable') features.push('Obi');
        if (aiData.Format?.includes('Reissue')) features.push('Reissue');

        const data = {
            "Action(CC=Cp1252)": "Add", "CustomLabel": customLabel, "StartPrice": userInput.price,
            "ConditionID": userInput.productCondition === '新品' ? 1000 : 3000, "Title": titleParts.join(' '),
            "Description": descriptionTemplate({ aiData, userInput }), "C:Brand": aiData.RecordLabel || "No Brand",
            "PicURL": picURL, "Category": userInput.category, // ★修正: ebayImageUrls -> picURL
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


// メインのルーティング処理
module.exports = (sessions) => {
    const router = express.Router();

    // トップページ表示
    router.get('/', (req, res) => {
        // ここでカテゴリや送料を読み込んでも良いが、簡単のため空で渡す
        res.render('index', { categories: [], shippingOptions: [] });
    });

    // 解析開始
    router.post('/process', async (req, res) => {
        const { parentFolderUrl, defaultCategory } = req.body;
        if (!parentFolderUrl) return res.redirect('/');

        const sessionId = uuidv4();
        // ★ categories と shippingOptions をセッションに保存
        sessions.set(sessionId, { status: 'processing', records: [], categories: [{code: defaultCategory, name: 'Default'}], shippingOptions: ['Default Shipping'] });

        res.render('results', { sessionId, defaultCategory, shippingOptions: ['Default Shipping'] });

        // 非同期でバックグラウンド処理を開始
        (async () => {
            const session = sessions.get(sessionId);
            try {
                const parentFolderId = parentFolderUrl.split('/').pop();
                const subfolders = await driveService.getSubfolders(parentFolderId);

                if (subfolders.length === 0) throw new Error('処理対象のフォルダが見つかりません。');
                
                session.records = subfolders.map(f => ({
                    id: uuidv4(), folderId: f.id, customLabel: f.name.split(' ')[0], status: 'pending'
                }));

                for (const record of session.records) {
                    try {
                        const imageFiles = await driveService.getRecordImages(record.folderId);
                        const imageBuffers = await Promise.all(
                            imageFiles.map(file => driveService.getDriveImageBuffer(file.id))
                        );
                        
                        // AI解析
                        record.aiData = await aiService.analyzeRecord(imageBuffers);
                        
                        // ★★★ eBay画像アップロード処理 ★★★
                        // J1画像を特定してアップロード
                        const j1Image = imageFiles.find(img => img.name.startsWith('J1_'));
                        const mainImageToUpload = j1Image || (imageFiles.length > 0 ? imageFiles[0] : null);

                        if (!mainImageToUpload) throw new Error('アップロード対象の画像がありません。');
                        
                        // getDriveImageStreamからBufferに変換して渡す必要があるが、
                        // 既に imageBuffers で全画像を取得済みなのでそれを利用する
                        const mainImageIndex = imageFiles.findIndex(f => f.id === mainImageToUpload.id);
                        const mainImageBuffer = imageBuffers[mainImageIndex];
                        
                        // recordService を使って eBay にアップロードし、URLを格納
                        // recordService がBufferを直接受け付けないため、ダミーのURLを持たせる
                        // recordServiceの改修が必要だが、ここでは簡易的に対応
                        // (理想は recordService.ensureEbayPicURLFromBuffer(buffer) のような関数)
                        // ここでは元の ebayService を直接使うのが手っ取り早い
                        const { uploadPictureFromBuffer } = require('../services/ebayService');
                        record.picURL = await uploadPictureFromBuffer(mainImageBuffer, { pictureName: record.customLabel });

                        // 全画像のIDも保持しておく（画面表示用）
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

    // 処理状況を返すAPI
    router.get('/status/:sessionId', (req, res) => {
        res.json(sessions.get(req.params.sessionId) || { status: 'error', error: 'Session not found' });
    });

    // ユーザーの入力を保存するAPI
    router.post('/save/:sessionId/:recordId', async (req, res) => {
        const { sessionId, recordId } = req.params;
        const session = sessions.get(sessionId);
        const record = session?.records.find(r => r.id === recordId);
        if (!record) return res.status(404).json({ error: 'Record not found' });
        record.userInput = req.body;
        record.status = 'saved';
        // フォルダ名を「済」つきに変更
        const originalFolder = await driveService.getSubfolders(record.folderId);
        // await driveService.renameFolder(record.folderId, `済 ${originalFolder.name}`);
        res.json({ status: 'ok' });
    });

    // CSVをダウンロード
    router.get('/csv/:sessionId', (req, res) => {
        const session = sessions.get(req.params.sessionId);
        if (!session) return res.status(404).send('Session not found');
        const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const fileName = `Records_${date}.csv`;
        res.header('Content-Type', 'text/csv; charset=UTF-8');
        res.attachment(fileName);
        res.send('\uFEFF' + generateCsv(session.records));
    });

    // 画像を表示
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
