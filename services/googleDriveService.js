const { google } = require('googleapis');

const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});

const drive = google.drive({ version: 'v3', auth });

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
        throw new Error('Google Driveからのファイル取得に失敗しました。フォルダが共有されているか確認してください。');
    }
}

module.exports = { getRecordImages };
