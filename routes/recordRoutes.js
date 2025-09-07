const express = require('express');
const { v4: uuidv4 } = require('uuid');
const driveService = require('../services/googleDriveService');
const aiService = require('../services/openAiService');
const { uploadPictureFromBuffer } = require('../services/ebayService');

// (descriptionTemplate と generateCsv 関数は変更ないので、ここでは省略します)
// ... 以前のコードと同じ ...
const descriptionTemplate = ({ aiData, userInput }) => {
    const tracklistHtml = aiData.Tracklist
        ? Object.entries(aiData.Tracklist).map(([key, track]) => `<li>${key}: ${track}</li>`).join('')
        : '<li>N/A</li>';
    const jacketDamageText = userInput.jacketDamage?.length > 0 ? `Jacket damages: ${userInput.jacketDamage.join(', ')}` : '';
    // userInput.artistが存在すればそれを使用し、なければaiData.Artistを使用
    const artist = userInput.artist || aiData.Artist || 'N/A';
    return `<div style="font-family: Arial, sans-serif; max-width: 1000px;"><h1 style="color: #1e3a8a;">${userInput.title}</h1><div style="display: flex; flex-wrap: wrap; margin-top: 20px;"><div style="flex: 1; min-width: 300px; padding: 10px;"><h2 style="color: #2c5282;">Condition</h2><ul><li>Sleeve: ${userInput.conditionSleeve}</li><li>Vinyl: ${userInput.conditionVinyl}</li><li>OBI: ${userInput.obi}</li></ul><h2 style="color: #2c5282;">Key Features</h2><ul><li>Artist: ${artist}</li><li>Format: ${aiData.Format || 'Vinyl'}</li><li>Genre: ${aiData.Genre || 'N/A'}</li><li>${jacketDamageText}</li><li>${userInput.comment || ''}</li></ul></div><div style="flex: 1; min-width: 300px; padding: 10px;"><h2 style="color: #2c5282;">Tracklist</h2><ol>${tracklistHtml}</ol></div></div><div style="margin-top: 20px;"><h2 style="color: #2c5282;">Product Description</h2><p>If you have any questions, please feel free to ask us.</p><h2 style="color: #2c5282;">Shipping</h2><p>Shipping by FedEx, DHL, or EMS.</p><h2 style="color: #2c5282;">International Buyers - Please Note:</h2><p>Import duties, taxes, and charges are not included. These charges are the buyer’s responsibility.</p></div></div>`.replace(/\s{2,}/g, ' ').replace(/\n/g, '');
};

const generateCsv = (records) => {
    const headers = [
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
    const headerRow = headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',');

    const rows = records.filter(r => r.status === 'saved').map(r => {
        const { aiData: ai, userInput: user, ebayImageUrls, customLabel } = r;
        const picURL = ebayImageUrls ? ebayImageUrls.join('|') : '';
        
        // ユーザーが編集したアーティスト名とタイトルを優先
        const artist = user.artist || ai.Artist || '';
        let finalTitle = user.title || ai.Title || '';
        if (artist) {
            finalTitle = `${artist} ${finalTitle}`;
        }
        if (user.obi && user.obi !== 'なし' && user.obi !== 'Not Applicable') {
            finalTitle += ' w/OBI';
        }
        
        const data = {
            "Action(CC=Cp1252)": "Add",
            "CustomLabel": customLabel,
            "StartPrice": user.price || '',
            "ConditionID": user.productCondition === '新品' ? '1000' : '3000',
            "Title": finalTitle,
            "Description": descriptionTemplate({ aiData: ai, userInput: user }),
            "C:Brand": ai.RecordLabel || '',
            "PicURL": picURL,
            "UPC": "",
            "Category": "176985",
            "PayPalAccepted": "1",
            "PayPalEmailAddress": "payAddress",
            "PaymentProfileName": "buy it now",
            "ReturnProfileName": "Seller 60days",
            "ShippingProfileName": user.shipping || '',
            "Country": "JP",
            "Location": "417-0816, Fuji Shizuoka",
            "StoreCategory": user.category || '',
            "Apply Profile Domestic": "0",
            "Apply Profile International": "0",
            "BuyerRequirements:LinkedPayPalAccount": "0",
            "Duration": "GTC",
            "Format": "FixedPriceItem",
            "Quantity": "1",
            "Currency": "USD",
            "SiteID": "US",
            "C:Country": ai.Country || '',
            "BestOfferEnabled": "0",
            "C:Artist": artist, // 編集後のアーティスト名を反映
            "C:Material": ai.Material || 'Vinyl',
            "C:Release Title": user.title || ai.Title || '',
            "C:Genre": ai.Genre || '',
            "C:Type": "",
            "C:Record Label": ai.RecordLabel || '',
            "C:Color": "",
            "C:Record Size": "",
            "C:Style": ai.Style || '',
            "C:Format": ai.Format || '',
            "C:Release Year": ai.Released || '',
            "C:Record Grading": user.conditionVinyl || '',
            "C:Sleeve Grading": user.conditionSleeve || '',
            "C:Inlay Condition": "",
            "C:Case Type": "",
            "C:Edition": "",
            "C:Speed": "",
            "C:Features": "",
            "C:Country/Region of Manufacture": "Japan",
            "C:Language": "",
            "C:Occasion": "",
            "C:Instrument": "",
            "C:Era": "",
            "C:Producer": "",
            "C:Fidelity Level": "",
            "C:Composer": "",
            "C:Conductor": "",
            "C:Performer Orchestra": "",
            "C:Run Time": "",
            "C:MPN": "",
            "C:California Prop 65 Warning": "",
            "C:Catalog Number": ai.CatalogNumber || '',
            "C:Number of Audio Channels": "",
            "C:Unit Quantity": "",
            "C:Unit Type": "",
            "C:Vinyl Matrix Number": "",
            "Created categories": ""
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
            console.log(`[${sessionId}] /process: 開始`);
            const shippingOptions = await driveService.getShippingOptions();
            const categories = await driveService.getStoreCategories();
            sessions.set(sessionId, { status: 'processing', records: [], shippingOptions, categories });
            res.render('results', { sessionId, defaultCategory, shippingOptions });
            console.log(`[${sessionId}] /process: 画面表示完了。非同期処理を開始します。`);
        } catch (error) {
            console.error(`[${sessionId}] /process: 初期データ取得エラー`, error);
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
                
                console.log(`[${sessionId}] 親フォルダの詳細を取得開始...`);
                const parentFolder = await driveService.getFolderDetails(parentFolderId);
                const parentFolderName = parentFolder.name;
                console.log(`[${sessionId}] 親フォルダ名: ${parentFolderName}`);

                console.log(`[${sessionId}] サブフォルダのリストを取得開始...`);
                const subfolders = (await driveService.getSubfolders(parentFolderId)).slice(0, 10);
                if (subfolders.length === 0) throw new Error('処理対象のフォルダが見つかりません。');
                console.log(`[${sessionId}] ${subfolders.length}件のサブフォルダが見つかりました。`);

                session.records = subfolders.map((f) => ({
                    id: uuidv4(),
                    folderId: f.id,
                    folderName: f.name,
                    status: 'pending',
                    customLabel: `${parentFolderName}-${f.name}`
                }));

                for (const record of session.records) {
                    console.log(`[${sessionId}] レコード処理開始: ${record.customLabel} (Folder ID: ${record.folderId})`);
                    try {
                        console.log(`[${sessionId}]   - 画像ファイルリストを取得中...`);
                        let imageFiles = await driveService.getRecordImages(record.folderId);
                        if (imageFiles.length === 0) throw new Error('フォルダ内に画像がありません。');
                        console.log(`[${sessionId}]   - ${imageFiles.length}件の画像が見つかりました。`);
                        
                        // 画像の優先順位ソートロジック
                        imageFiles.sort((a, b) => {
                            const priority = (name) => {
                                const upper = name.toUpperCase();
                                if (upper.startsWith('M')) return 1;
                                if (upper.startsWith('J')) return 2;
                                if (upper.startsWith('R')) return 3;
                                return 4;
                            };
                            return priority(a.name) - priority(b.name) || a.name.localeCompare(b.name);
                        });

                        let imagesForAi = imageFiles.filter(file => /^(J1|J2|R1)/i.test(file.name));
                        if (imagesForAi.length === 0) imagesForAi = imageFiles.slice(0, 3);
                        console.log(`[${sessionId}]   - AI解析用に${imagesForAi.length}件の画像を選択しました。`);
                        
                        console.log(`[${sessionId}]   - AI解析用画像のバッファを取得中...`);
                        const imageBuffersForAi = await Promise.all(
                            imagesForAi.map(file => driveService.getDriveImageBuffer(file.id))
                        );
                        if (imageBuffersForAi.length === 0) throw new Error('AI解析用の画像が見つかりませんでした。');
                        
                        console.log(`[${sessionId}]   - OpenAI APIでの解析を開始...`);
                        record.aiData = await aiService.analyzeRecord(imageBuffersForAi);
                        console.log(`[${sessionId}]   - OpenAI APIでの解析が完了しました。 Title: ${record.aiData.Title}`);
                        
                        console.log(`[${sessionId}]   - eBayへの画像アップロードを開始 (${imageFiles.length}件)...`);
                        record.ebayImageUrls = await Promise.all(
                            imageFiles.map(async (file) => {
                                const buffer = await driveService.getDriveImageBuffer(file.id);
                                return await uploadPictureFromBuffer(buffer, { pictureName: `${record.customLabel}_${file.name}` });
                            })
                        );
                        console.log(`[${sessionId}]   - eBayへの画像アップロードが完了しました。`);

                        record.images = imageFiles.map(f => ({ id: f.id, name: f.name }));
                        record.status = 'success';
                        console.log(`[${sessionId}] レコード処理成功: ${record.customLabel}`);

                    } catch (err) {
                        console.error(`[${sessionId}] レコード処理エラー ${record.customLabel}:`, err);
                        record.status = 'error';
                        record.error = err.message;
                    }
                }
                session.status = 'completed';
                console.log(`[${sessionId}] 全ての処理が完了しました。`);
            } catch (err) {
                console.error(`[${sessionId}] セッション全体の致命的なエラー:`, err);
                session.status = 'error';
                session.error = err.message;
            }
        })();
    });

    router.get('/status/:sessionId', (req, res) => {
        res.json(sessions.get(req.params.sessionId) || { status: 'error', error: 'Session not found' });
    });

    router.post('/research/:sessionId/:recordId', async (req, res) => {
        const { sessionId, recordId } = req.params;
        const session = sessions.get(sessionId);
        const record = session?.records.find(r => r.id === recordId);
        if (!record) return res.status(404).json({ error: 'Record not found' });

        try {
            record.status = 'researching';
            let imageFiles = await driveService.getRecordImages(record.folderId);
            if (imageFiles.length === 0) throw new Error('フォルダ内に画像がありません。');
            
            let imagesForAi = imageFiles.filter(file => /^(J1|J2|R1)/i.test(file.name));
            if (imagesForAi.length === 0) imagesForAi = imageFiles.slice(0, 3);
            
            const imageBuffersForAi = await Promise.all(
                imagesForAi.map(file => driveService.getDriveImageBuffer(file.id))
            );
            if (imageBuffersForAi.length === 0) throw new Error('AI解析用の画像が見つかりませんでした。');
            
            const excludeUrl = record.aiData?.DiscogsUrl || null;
            record.aiData = await aiService.analyzeRecord(imageBuffersForAi, excludeUrl);
            record.status = 'success';
            
            res.json({ status: 'ok', aiData: record.aiData });

        } catch (err) {
            console.error(`Error re-searching record ${record.customLabel}:`, err);
            record.status = 'error';
            record.error = err.message;
            res.status(500).json({ status: 'error', error: err.message });
        }
    });

    router.post('/save/:sessionId/:recordId', async (req, res) => {
        const { sessionId, recordId } = req.params;
        const session = sessions.get(sessionId);
        const record = session?.records.find(r => r.id === recordId);
        if (!record) return res.status(404).json({ error: 'Record not found' });
        
        record.userInput = { ...record.userInput, ...req.body };
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
