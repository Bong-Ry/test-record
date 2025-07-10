const { google } = require('googleapis');

// 書き込み権限を追加
const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

// 指定フォルダ内のサブフォルダを取得する関数
async function getSubfolders(parentFolderId) {
    try {
        const res = await drive.files.list({
            q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and not name contains '済'`,
            fields: 'files(id, name)',
            pageSize: 10, // 最大10件まで
        });
        return res.data.files || [];
    } catch (error) {
        console.error('Error fetching subfolders:', error.message);
        throw new Error('サブフォルダの取得に失敗しました。');
    }
}

async function getRecordImages(folderId) {
    try {
        const res = await drive.files.list({
            q: `'${folderId}' in parents and mimeType contains 'image/'`,
            fields: 'files(id, name)',
        });

        const files = res.data.files;
        if (!files || files.length === 0) {
            throw new Error(`フォルダID[${folderId}]内に画像が見つかりません。`);
        }

        return files.map(file => ({
            id: file.id,
            name: file.name,
            url: `https://drive.google.com/uc?export=download&id=${file.id}`
        }));
    } catch (error) {
        console.error('Google Drive API Error:', error.message);
        throw new Error('Google Driveからのファイル取得に失敗しました。');
    }
}

// フォルダ名を変更する関数
async function renameFolder(folderId, newName) {
    try {
        await drive.files.update({
            fileId: folderId,
            requestBody: {
                name: newName,
            },
        });
    } catch (error) {
        console.error('Error renaming folder:', error.message);
        // エラーはログに出力するが、処理は続行
    }
}

async function getDriveImageStream(fileId) {
    try {
        const res = await drive.files.get(
            { fileId: fileId, alt: 'media' },
            { responseType: 'stream' }
        );
        return res.data;
    } catch (error) {
        console.error('Error fetching image stream:', error.message);
        throw new Error('Image stream could not be fetched.');
    }
}

module.exports = { getSubfolders, getRecordImages, renameFolder, getDriveImageStream };
