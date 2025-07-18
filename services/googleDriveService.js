const { google } = require('googleapis');

const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/drive'],
});

const drive = google.drive({ version: 'v3', auth });

/*───────────────────────────────
 * Drive helper
 *───────────────────────────────*/
async function listAll(params) {
    const files = [];
    let pageToken;
    do {
        const res = await drive.files.list({ ...params, pageToken });
        if (res.data.files?.length) files.push(...res.data.files);
        pageToken = res.data.nextPageToken;
    } while (pageToken);
    return files;
}

/* 親フォルダ内の未処理フォルダ（名前に「済」を含まない） */
async function getSubfolders(parentFolderId) {
    try {
        const files = await listAll({
            q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name), nextPageToken',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
            corpora: 'allDrives',
        });
        return files.filter(f => !f.name.includes('済'));
    } catch (err) {
        console.error('Error fetching subfolders:', err.message);
        throw new Error('サブフォルダの取得に失敗しました。');
    }
}

/* 親フォルダ内の処理済みフォルダ（名前に「済」を含む） */
async function getProcessedSubfolders(parentFolderId) {
    try {
        const files = await listAll({
            q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name), nextPageToken',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
            corpora: 'allDrives',
        });
        return files.filter(f => f.name.includes('済'));
    } catch (err) {
        console.error('Error fetching processed subfolders:', err.message);
        throw new Error('Processed subfolders retrieval failed.');
    }
}

/* フォルダ内画像一覧 */
async function getRecordImages(folderId) {
    try {
        const files = await listAll({
            q: `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`,
            fields: 'files(id, name), nextPageToken',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        });
        return files;
    } catch (err) {
        console.error('Error fetching record images:', err.message);
        throw new Error('Google Driveからのファイル取得に失敗しました。');
    }
}

/* フォルダ名変更 */
async function renameFolder(folderId, newName) {
    try {
        await drive.files.update({
            fileId: folderId,
            requestBody: { name: newName },
            supportsAllDrives: true,
        });
    } catch (err) {
        console.error('Error renaming folder:', err.message);
    }
}

/* 画像ストリーム */
async function getDriveImageStream(fileId) {
    const res = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' }
    );
    return res.data;
}

/* 画像 Buffer */
async function getDriveImageBuffer(fileId) {
    try {
        const stream = await getDriveImageStream(fileId);
        return new Promise((resolve, reject) => {
            const chunks = [];
            stream.on('data', c => chunks.push(c));
            stream.on('error', reject);
            stream.on('end', () => resolve(Buffer.concat(chunks)));
        });
    } catch (err) {
        console.error('Error fetching image buffer:', err.message);
        throw new Error('Image buffer could not be fetched.');
    }
}

module.exports = {
    getSubfolders,
    getProcessedSubfolders,
    getRecordImages,
    renameFolder,
    getDriveImageStream,
    getDriveImageBuffer
};
