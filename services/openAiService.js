const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const PROMPT_TEXT = `
あなたはプロのアナログレコード鑑定士です。
提供されたレコードのジャケットやラベルの画像から、Discogsのデータベースを参照して、このレコードを1件だけ特定してください。
そして、以下のJSON形式に従って、すべての項目を英語で出力してください。
もし日本語の情報が見つかった場合は、必ず自然な英語に翻訳してください。日本語は一切含めないでください。

- Title: アルバムのタイトル。必ず英語で表記してください。
- Artist: アーティスト名。必ず英語（ローマ字）で表記してください。日本語は使用しないでください。
- Genre: 音楽ジャンル。必ず英語で表記してください。
- Style: より詳細な音楽スタイル。必ず英語で表記してください。
- RecordLabel: レーベル名。
- CatalogNumber: カタログ番号。
- Format: "Vinyl, LP, Album, Reissue" のような詳細なフォーマット。
- Country: リリース国。
- Released: リリース年。
- Tracklist: トラック番号をキー、曲名を値とするJSONオブジェクト形式で記載してください。例: { "A1": "Song Title 1", "A2": "Song Title 2", "B1": "Song Title 3" }
- Notes: Discogsに記載されている特記事項。
- DiscogsUrl: 特定したDiscogsのURL。
- MPN: カタログ番号と同じで可。
- Material: レコードの素材。通常は "Vinyl" です。

必ず指定されたJSONフォーマットで回答してください。他のテキストは含めないでください。
`;

// URLの代わりに画像データのBufferを受け取るように変更
async function analyzeRecord(imageBuffers) {
    if (!imageBuffers || imageBuffers.length === 0) {
        throw new Error('画像データがありません。');
    }

    // 画像データをBase64形式に変換
    const imageMessages = imageBuffers.map(buffer => {
        const base64Image = buffer.toString('base64');
        return {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${base64Image}` },
        };
    });

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: PROMPT_TEXT },
                        ...imageMessages,
                    ],
                },
            ],
            response_format: { type: "json_object" },
        });

        const content = response.choices[0].message.content;
        return JSON.parse(content);

    } catch (error) {
        console.error('OpenAI API Error:', error.response ? error.response.data : error.message);
        throw new Error('OpenAI APIでの解析に失敗しました。');
    }
}

module.exports = { analyzeRecord };
