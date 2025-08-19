const { google } = require('googleapis');

const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets.readonly'
    ],
});

const drive = google.drive({ version: 'v3', auth });
const sheets = google.sheets({ version: 'v4', auth });

const SPREADSHEET_ID = '1pGXjlYl29r1KIIPiIu0N4gXKdGquhIZe3UjH_QApwfA';

async function getStoreCategories() {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: 'Category-レコード!A2:B',
        });

        const rows = response.data.values;
        if (rows && rows.length) {
            return rows
                .filter(row => row[0] && row[1])
                .map(row => ({
                    name: row[0],
                    id: row[1],
                }));
        }
        return [];
    } catch (err) {
        console.error('The API returned an error: ' + err);
        throw new Error('スプレッドシートからのカテゴリ取得に失敗しました。');
    }
}

async function getShippingOptions() {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: '送料管理!A2:A',
        });

        const rows = response.data.values;
        if (rows && rows.length) {
            return rows.flat().filter(cost => cost && cost.trim() !== '');
        }
        return [];
    } catch (err) {
        console.error('The API returned an error: ' + err);
        throw new Error('スプレッドシートからの送料取得に失敗しました。');
    }
}

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

async function getSubfolders(parentFolderId) {
    try {
        const files = await listAll({
            q: `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name), nextPageToken',
            // ★★★ 修正点: 作成日時(createdTime)で昇順(古い順)にソート ★★★
            orderBy: 'createdTime', 
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

async function getDriveImageStream(fileId) {
    const res = await drive.files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' }
    );
    return res.data;
}

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
    getDriveImageBuffer,
    getStoreCategories,
    getShippingOptions,
};
