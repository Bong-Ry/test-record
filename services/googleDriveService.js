const { google } = require('googleapis');

const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

async function getSubfolders(parentFolderId) {
    try {
        const res = await drive.files.list({
            q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and not name contains '済'`,
            fields: 'files(id, name)',
            pageSize: 10,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
            corpora: 'allDrives',
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
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        });
        return res.data.files || [];
    } catch (error) {
        console.error('Error fetching record images:', error.message);
        throw new Error('Google Driveからのファイル取得に失敗しました。');
    }
}

async function renameFolder(folderId, newName) {
    try {
        await drive.files.update({
            fileId: folderId,
            requestBody: { name: newName },
            supportsAllDrives: true,
        });
    } catch (error) {
        console.error('Error renaming folder:', error.message);
    }
}

async function getDriveImageStream(fileId) {
    const res = await drive.files.get(
        { fileId: fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' }
    );
    return res.data;
}

// 画像データをBufferとして取得する関数
async function getDriveImageBuffer(fileId) {
    try {
        const stream = await getDriveImageStream(fileId);
        return new Promise((resolve, reject) => {
            const chunks = [];
            stream.on('data', (chunk) => chunks.push(chunk));
            stream.on('error', reject);
            stream.on('end', () => resolve(Buffer.concat(chunks)));
        });
    } catch (error) {
        console.error('Error fetching image buffer:', error.message);
        throw new Error('Image buffer could not be fetched.');
    }
}

module.exports = { getSubfolders, getRecordImages, renameFolder, getDriveImageStream, getDriveImageBuffer };

