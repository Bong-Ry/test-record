const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const PROMPT_TEXT = `
あなたはプロのアナログレコード鑑定士です。
提供されたレコードのジャケットやラベルの画像を注意深く分析し、Discogsデータベースから最も一致するレコードを1件だけ特定してください。
その後、以下のJSON形式に従い、全ての項目を英語で出力してください。日本語は一切含めないでください。

- Title: アルバムの正式タイトル。
- Artist: アーティストの正式名称。
- MarketPrice: DiscogsやeBayの販売履歴など、複数の情報源を比較検討し、このレコードの一般的な中古市場価格の相場を "USD" で記述してください。単一の出品価格ではなく、取引が成立している価格帯を参考にしてください。例: "35-50 USD"。情報が不十分な場合は "N/A" としてください。
- Genre: 主要な音楽ジャンル。
- Style: より詳細な音楽スタイル。
- RecordLabel: レコードレーベル名。
- CatalogNumber: カタログ番号。
- Format: "Vinyl, LP, Album, Reissue, Stereo" のような詳細なフォーマット。
- Country: リリース国。
- Released: リリース年。
- Tracklist: { "A1": "曲名1", "A2": "曲名2" } のように、トラック番号をキー、曲名を値とするJSONオブジェクト形式で記載してください。
- Notes: Discogsに記載されている特記事項や識別のための重要な情報。
- DiscogsUrl: 特定したDiscogsページのURL。
- MPN: カタログ番号と同じ値を設定してください。
- Material: レコードの素材。通常は "Vinyl" です。

制約事項:
- 画像から読み取れるカタログ番号、レーベル、特徴（帯の有無など）を最優先し、最も確実な情報に基づいてレコードを特定してください。
- 再検索の場合、前回の候補とは異なる、より類似性の高いレコードを検索してください。
- 除外すべきDiscogsのURLが指定された場合、そのURLのレコードは絶対に結果に含めないでください。
- 必ず指定されたJSONフォーマットのみを回答し、他のテキストは一切含めないでください。
`;

// analyzeRecord関数は変更なし
async function analyzeRecord(imageBuffers, excludeUrl = null) {
    if (!imageBuffers || imageBuffers.length === 0) {
        throw new Error('画像データがありません。');
    }

    const imageMessages = imageBuffers.map(buffer => ({
        type: 'image_url',
        image_url: { url: `data:image/jpeg;base64,${buffer.toString('base64')}` },
    }));
    
    let userPrompt = PROMPT_TEXT;
    if (excludeUrl) {
        userPrompt += `\n除外するURL: ${excludeUrl}`;
    }

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini', // モデルをgpt-4o-miniに戻す
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: userPrompt },
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
