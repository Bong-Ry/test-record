const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const PROMPT_TEXT = `
あなたはプロのアナログレコード鑑定士です。
提供されたレコードのジャケットやラベルの画像から、Discogsのデータベースを参照して、このレコードを1件だけ特定してください。
そして、以下のJSON形式に従って、eBay出品用の項目を英語で出力してください。

- Title: アーティスト名とアルバム名を簡潔に。
- Subtitle: 盤のフォーマット（LP, EP, 12", 7"）、特徴（Promo, Reissue, Limited Editionなど）、重要な情報を追記。
- Artist: アーティスト名。
- Genre: 音楽ジャンル。
- Style: より詳細な音楽スタイル。
- RecordLabel: レーベル名。
- CatalogNumber: カタログ番号。
- Format: "Vinyl, LP, Album, Reissue" のような詳細なフォーマット。
- Country: リリース国。
- Released: リリース年。
- Tracklist: A1, A2, B1, B2...の形式で全トラックリストを記載。
- Notes: Discogsに記載されている特記事項。
- DiscogsUrl: 特定したDiscogsのURL。
- MPN: カタログ番号と同じで可。

必ず指定されたJSONフォーマットで回答してください。他のテキストは含めないでください。
`;

/**
 * 画像URLをOpenAI Vision APIに送信し、レコード情報を解析させる
 * @param {string[]} imageUrls 画像の公開URL配列
 * @returns {Promise<object>} 解析結果のJSONオブジェクト
 */
async function analyzeRecord(imageUrls) {
    if (!imageUrls || imageUrls.length === 0) {
        throw new Error('画像URLがありません。');
    }

    const imageMessages = imageUrls.map(url => ({
        type: 'image_url',
        image_url: { url: url },
    }));

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
