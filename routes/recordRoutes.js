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
    return `<div style="font-family: Arial, sans-serif; max-width: 1000px;"><h1 style="color: #1e3a8a;">${userInput.title}</h1><div style="display: flex; flex-wrap: wrap; margin-top: 20px;"><div style="flex: 1; min-width: 300px; padding: 10px;"><h2 style="color: #2c5282;">Condition</h2><ul><li>Sleeve: ${userInput.conditionSleeve}</li><li>Vinyl: ${userInput.conditionVinyl}</li><li>OBI: ${userInput.obi}</li></ul><h2 style="color: #2c5282;">Key Features</h2><ul><li>Artist: ${aiData.Artist || 'N/A'}</li><li>Format: ${aiData.Format || 'Vinyl'}</li><li>Genre: ${aiData.Genre || 'N/A'}</li><li>${jacketDamageText}</li><li>${userInput.comment || ''}</li></ul></div><div style="flex: 1; min-width: 300px; padding: 10px;"><h2 style="color: #2c5282;">Tracklist</h2><ol>${tracklistHtml}</ol></div></div><div style="margin-top: 20px;"><h2 style="color: #2c5282;">Product Description</h2><p>If you have any questions, please feel free to ask us.</p><h2 style="color: #2c5282;">Shipping</h2><p>Shipping by FedEx, DHL, or EMS.</p><h2 style="color: #2c5282;">International Buyers - Please Note:</h2><p>Import duties, taxes, and charges are not included. These charges are the buyer’s responsibility.</p></div></div>`.replace(/\s{2,}/g, ' ').replace(/\n/g, '');
};

// record-listerの仕様に合わせたCSV生成関数2
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

        let finalTitle = user.title || ai.Title || '';
        if (ai.Artist) {
            finalTitle = `${ai.Artist} ${finalTitle}`;
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
            "UPC": "", // 空欄
            "Category": "176985", // 固定値
            "PayPalAccepted": "1",
            "PayPalEmailAddress": "payAddress",
            "PaymentProfileName": "buy it now",
            "ReturnProfileName": "Seller 60days",
            "ShippingProfileName": user.shipping || '',
            "Country": "JP",
            "Location": "417-0816, Fuji Shizuoka",
            "StoreCategory": user.category || '', // ユーザー選択のカテゴリ
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
            "C:Artist": ai.Artist || '',
            "C:Material": ai.Material || 'Vinyl',
            "C:Release Title": user.title || ai.Title || '',
            "C:Genre": ai.Genre || '',
            "C:Type": "", // 空欄
            "C:Record Label": ai.RecordLabel || '',
            "C:Color": "", // 空欄
            "C:Record Size": "", // 空欄
            "C:Style": ai.Style || '',
            "C:Format": ai.Format || '',
            "C:Release Year": ai.Released || '',
            "C:Record Grading": user.conditionVinyl || '',
            "C:Sleeve Grading": user.conditionSleeve || '',
            "C:Inlay Condition": "", // 空欄
            "C:Case Type": "", // 空欄
            "C:Edition": "", // 空欄
            "C:Speed": "", // 空欄
            "C:Features": "", // 空欄
            "C:Country/Region of Manufacture": "Japan",
            "C:Language": "", // 空欄
            "C:Occasion": "", // 空欄
            "C:Instrument": "", // 空欄
            "C:Era": "", // 空欄
            "C:Producer": "", // 空欄
            "C:Fidelity Level": "", // 空欄
            "C:Composer": "", // 空欄
            "C:Conductor": "", // 空欄
            "C:Performer Orchestra": "", // 空欄
            "C:Run Time": "", // 空欄
            "C:MPN": "", // 空欄
            "C:California Prop 65 Warning": "", // 空欄
            "C:Catalog Number": ai.CatalogNumber || '',
            "C:Number of Audio Channels": "", // 空欄
            "C:Unit Quantity": "", // 空欄
            "C:Unit Type": "", // 空欄
            "C:Vinyl Matrix Number": "", // 空欄
            "Created categories": "" // 空欄
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
            sessions.set(sessionId, { status: 'processing', records: [], shippingOptions, categories });
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
                    id: uuidv4(), folderId: f.id, folderName: f.name, status: 'pending',
                    customLabel: `${datePrefix}_${(processedCount + index + 1).toString().padStart(4, '0')}`
                }));

                for (const record of session.records) {
                    try {
                        let imageFiles = await driveService.getRecordImages(record.folderId);
                        if (imageFiles.length === 0) throw new Error('フォルダ内に画像がありません。');
                        
                        // 画像の優先順位ソートロジック
                        const getSortPriority = (fileName) => {
                            const upperCaseName = fileName.toUpperCase();
                            if (upperCaseName.startsWith('M')) return 1;
                            if (upperCaseName.startsWith('J')) return 2;
                            if (upperCaseName.startsWith('R')) return 3;
                            return 4;
                        };

                        imageFiles.sort((a, b) => {
                            const priorityA = getSortPriority(a.name);
                            const priorityB = getSortPriority(b.name);
                            if (priorityA !== priorityB) {
                                return priorityA - priorityB;
                            }
                            return a.name.localeCompare(b.name);
                        });

                        // ★★★ 変更点1: 'J1', 'J2', 'R1'で始まる画像ファイルをAI解析用に選定 ★★★
                        let imagesForAi = imageFiles.filter(file => {
                            const upperCaseName = file.name.toUpperCase();
                            return upperCaseName.startsWith('J1') || upperCaseName.startsWith('J2') || upperCaseName.startsWith('R1');
                        });

                        // 該当ファイルがない場合は、ソート後の先頭3枚をフォールバックとして使用
                        if (imagesForAi.length === 0) {
                            imagesForAi = imageFiles.slice(0, 3);
                        }
                        
                        const imageBuffersForAi = await Promise.all(
                            imagesForAi.map(file => driveService.getDriveImageBuffer(file.id))
                        );
                        
                        if (imageBuffersForAi.length === 0) {
                            throw new Error('AI解析用の画像が見つかりませんでした。');
                        }
                        record.aiData = await aiService.analyzeRecord(imageBuffersForAi);
                        
                        // ★★★ 変更点2: 全ての画像を1枚ずつeBayにアップロード (変更なし) ★★★
                        record.ebayImageUrls = [];
                        for (const file of imageFiles) {
                            const buffer = await driveService.getDriveImageBuffer(file.id);
                            const uploadedUrl = await uploadPictureFromBuffer(buffer, { pictureName: `${record.customLabel}_${file.name}` });
                            record.ebayImageUrls.push(uploadedUrl);
                        }

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
