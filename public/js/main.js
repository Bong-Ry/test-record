document.addEventListener('DOMContentLoaded', () => {
    if (typeof sessionId === 'undefined') return;

    const tableBody          = document.querySelector('#results-table tbody');
    const modal              = document.getElementById('image-modal');
    const modalImg           = document.getElementById('modal-image');
    const modalClose         = document.querySelector('.modal-close');
    const progressContainer  = document.getElementById('progress-container');
    const progressBarInner   = document.querySelector('.progress-bar-inner');
    const progressText       = document.getElementById('progress-text');
    const errorMessage       = document.getElementById('error-message');
    const resultsContainer   = document.getElementById('results-table-container');
    const downloadBtn        = document.getElementById('download-csv-btn');

    function createRow(record) {
        const j1Image   = record.images?.find(img => img.name.toUpperCase().startsWith('J1'));
        const mainImage = j1Image || (record.images && record.images.length > 0 ? record.images[0] : null);
        const imageUrl  = mainImage ? `/image/${mainImage.id}` : 'https://via.placeholder.com/120';

        const sku          = record.customLabel || '';
        const title        = record.aiData?.Title || 'N/A';
        const artist       = record.aiData?.Artist || 'N/A';
        const marketPrice  = record.aiData?.MarketPrice || 'N/A';
        const isError      = record.status === 'error';

        const conditionOptions      = ['NM', 'EX', 'VG+', 'VG', 'G', 'なし'];
        const conditionOptionsHtml  = conditionOptions.map(opt => `<option value="${opt}">${opt}</option>`).join('');

        const damageOptions   = ['上部(下部)の裂け', '角潰れ', 'シワ', 'シミ', 'ラベル剥がれ'];
        const damageCheckboxes = damageOptions.map(opt =>
            `<label class="checkbox-label"><input type="checkbox" name="jacketDamage" value="${opt}" ${isError ? 'disabled' : ''}> ${opt}</label>`
        ).join('');

        const priceOptions = ['29.99', '39.99', '59.99', '79.99', '99.99'];
        const priceRadios  = priceOptions.map((price, index) =>
            `<label class="radio-label"><input type="radio" name="price-${record.id}" value="${price}" ${index === 0 ? 'checked' : ''} ${isError ? 'disabled' : ''}> ${price} USD</label>`
        ).join('')
        + `<label class="radio-label"><input type="radio" name="price-${record.id}" value="other" ${isError ? 'disabled' : ''}> その他</label>`
        + `<input type="number" name="price-other-${record.id}" class="other-price-input" style="display:none;" placeholder="価格" ${isError ? 'disabled' : ''}>`;
        
        const categoriesHtml = record.categories ? record.categories.map(cat =>
            `<option value="${cat.id}" ${cat.id === defaultCategory ? 'selected' : ''}>${cat.name}</option>`
        ).join('') : `<option value="">読込失敗</option>`;

        const shippingOptionsHtml = shippingOptions.map(opt => `<option value="${opt}">${opt}</option>`).join('');

        return `
            <tr id="row-${record.id}" data-record-id="${record.id}" class="record-row">
                <td class="status-cell">${isError ? `❌<br><small>${record.error || ''}</small>` : `<span id="status-${record.id}">✏️</span>`}</td>
                <td class="image-cell"><img src="${imageUrl}" alt="Record Image" class="main-record-image"></td>
                <td class="info-cell">
                    <div class="info-input-group"><label>SKU</label><span class="sku-display">${sku}</span></div>
                    <div class="info-input-group"><label>タイトル</label><textarea name="title" rows="3" class="title-input">${title}</textarea></div>
                    <div class="info-input-group"><label>アーティスト</label><textarea name="artist" rows="2" class="artist-input">${artist}</textarea></div>
                    <div class="info-input-group"><label>相場価格</label><div class="market-price-display">${marketPrice}</div></div>
                </td>
                <td class="input-cell">
                    <div class="input-section">
                        <div class="input-group full-width"><label>価格</label><div class="radio-group compact">${priceRadios}</div></div>
                        <div class="input-group"><label>送料</label><select name="shipping" ${isError ? 'disabled' : ''}>${shippingOptionsHtml}</select></div>
                        <div class="input-group"><label>商品の状態</label><select name="productCondition" ${isError ? 'disabled' : ''}><option value="中古">中古</option><option value="新品">新品</option></select></div>
                    </div>
                    <h3 class="section-title">状態</h3>
                    <div class="input-section">
                        <div class="input-group"><label>ジャケットの状態</label><select name="conditionSleeve" ${isError ? 'disabled' : ''}>${conditionOptionsHtml.replace('value="なし"','value="Not Applicable"')}</select></div>
                        <div class="input-group"><label>レコードの状態</label><select name="conditionVinyl" ${isError ? 'disabled' : ''}>${conditionOptionsHtml.replace('value="なし"','value="Not Applicable"')}</select></div>
                        <div class="input-group"><label>OBIの状態</label><select name="obi" class="obi-select" ${isError ? 'disabled' : ''}>${conditionOptionsHtml}</select></div>
                    </div>
                    <div class="input-group full-width"><label>ジャケットのダメージ</label><div class="checkbox-group">${damageCheckboxes}</div></div>
                     <div class="input-group full-width" style="margin-top:15px;"><label>カテゴリー</label><select name="category" ${isError ? 'disabled' : ''}>${categoriesHtml}</select></div>
                    <div class="input-group full-width" style="margin-top: 15px;"><label>コメント</label><textarea name="comment" rows="3" ${isError ? 'disabled' : ''}></textarea></div>
                </td>
                <td class="action-cell">
                    <button class="btn btn-save" ${isError ? 'disabled' : ''}>保存</button>
                    <button class="btn btn-research" ${isError ? 'disabled' : ''}>再検索</button>
                </td>
            </tr>`;
    }

    function handleSave(event) {
        const row       = event.target.closest('tr');
        const recordId  = row.dataset.recordId;
        const statusEl  = document.getElementById(`status-${recordId}`);

        const jacketDamageNodes = row.querySelectorAll('input[name="jacketDamage"]:checked');
        const jacketDamage      = Array.from(jacketDamageNodes).map(node => node.value);

        const priceRadio = row.querySelector(`input[name="price-${recordId}"]:checked`);
        let price;
        if (priceRadio.value === 'other') {
            price = row.querySelector(`input[name="price-other-${recordId}"]`).value;
        } else {
            price = priceRadio.value;
        }

        const data = {
            title:            row.querySelector('[name="title"]').value,
            artist:           row.querySelector('[name="artist"]').value,
            price:            price,
            shipping:         row.querySelector('[name="shipping"]').value,
            productCondition: row.querySelector('[name="productCondition"]').value,
            conditionSleeve:  row.querySelector('[name="conditionSleeve"]').value,
            conditionVinyl:   row.querySelector('[name="conditionVinyl"]').value,
            obi:              row.querySelector('[name="obi"]').value,
            jacketDamage:     jacketDamage,
            comment:          row.querySelector('[name="comment"]').value,
            category:         row.querySelector('[name="category"]').value,
        };

        fetch(`/save/${sessionId}/${recordId}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(data),
        })
        .then(res => res.json())
        .then(result => {
            if (result.status === 'ok') {
                statusEl.textContent = '✅';
                row.classList.add('saved');
                row.querySelectorAll('textarea, select, input, button').forEach(el => el.style.backgroundColor = '#e9ecef');
                event.target.style.backgroundColor = '#2ecc71';
                downloadBtn.style.display = 'inline-block';
            }
        });
    }

    function handleResearch(event) {
        const row = event.target.closest('tr');
        const recordId = row.dataset.recordId;
        const statusEl = document.getElementById(`status-${recordId}`);
        
        statusEl.textContent = '🔄';
        event.target.disabled = true;

        fetch(`/research/${sessionId}/${recordId}`, { method: 'POST' })
        .then(res => res.json())
        .then(result => {
            if (result.status === 'ok') {
                const aiData = result.aiData;
                row.querySelector('textarea[name="title"]').value = aiData.Title || 'N/A';
                row.querySelector('textarea[name="artist"]').value = aiData.Artist || 'N/A';
                row.querySelector('.market-price-display').textContent = aiData.MarketPrice || 'N/A';
                statusEl.textContent = '✏️';
            } else {
                statusEl.innerHTML = `❌<br><small>${result.error || '再検索失敗'}</small>`;
            }
        })
        .catch(() => { statusEl.innerHTML = `❌<br><small>通信エラー</small>`; })
        .finally(() => { event.target.disabled = false; });
    }

    function setupEventListeners(row) {
        row.querySelector('.btn-save').addEventListener('click', handleSave);
        row.querySelector('.btn-research').addEventListener('click', handleResearch);
        row.querySelector('.main-record-image').addEventListener('click', e => {
            modal.style.display = 'flex';
            modalImg.src = e.target.src;
        });

        const titleInput    = row.querySelector('textarea[name="title"]');
        const artistInput   = row.querySelector('textarea[name="artist"]');
        const titleWarning  = row.querySelector('.title-warning');
        const obiSelect     = row.querySelector('.obi-select');

        const checkTitleLength = () => {
            const artistLength = artistInput.value.length;
            const obiValue = obiSelect.value;
            let maxLength = 80 - (artistLength + 1);
            if (obiValue !== 'なし' && obiValue !== 'Not Applicable') {
                maxLength -= ' w/OBI'.length;
            }

            if (titleInput.value.length > maxLength) {
                 if (!titleWarning) {
                    const warningEl = document.createElement('div');
                    warningEl.className = 'title-warning';
                    titleInput.parentNode.appendChild(warningEl);
                }
                row.querySelector('.title-warning').textContent = `※タイトルの文字数制限(${maxLength}文字)を超えています。`;
                row.querySelector('.title-warning').style.display = 'block';
            } else if (titleWarning) {
                titleWarning.style.display = 'none';
            }
        };

        checkTitleLength();
        titleInput.addEventListener('input', checkTitleLength);
        artistInput.addEventListener('input', checkTitleLength);
        obiSelect.addEventListener('change', checkTitleLength);

        const recordId = row.dataset.recordId;
        const priceRadios = row.querySelectorAll(`input[name="price-${recordId}"]`);
        const otherPriceInput = row.querySelector(`input[name="price-other-${recordId}"]`);
        priceRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                otherPriceInput.style.display = (radio.value === 'other') ? 'inline-block' : 'none';
            });
        });
    }

    modalClose.onclick = () => { modal.style.display = 'none'; };
    window.onclick     = event => { if (event.target === modal) modal.style.display = 'none'; };

    function checkStatus() {
        fetch(`/status/${sessionId}`)
        .then(res => res.json())
        .then(session => {
            // ★★★ 追加: サーバーから受け取ったデータを毎回コンソールに表示 ★★★
            console.log('Status Check - Received session data:', session);

            try {
                if (!session) {
                    console.warn('Session data is missing. Retrying...');
                    return;
                }
                if (session.status === 'error') {
                     clearInterval(intervalId);
                     progressText.textContent = 'サーバー側でエラーが発生しました。';
                     errorMessage.textContent = session.error;
                     errorMessage.style.display = 'block';
                     console.error('Server-side error:', session.error);
                     return;
                }
                if (!session.records) {
                    console.warn('Session records not yet available. Retrying...');
                    return;
                }

                session.records.forEach(record => {
                    let row = document.getElementById(`row-${record.id}`);
                    if (!row && record.status !== 'pending' && record.status !== 'researching') {
                        record.categories = session.categories;
                        tableBody.insertAdjacentHTML('beforeend', createRow(record));
                        row = document.getElementById(`row-${record.id}`);
                        setupEventListeners(row);
                    }
                });

                const total = session.records.length;
                const processed = session.records.filter(r => r.status !== 'pending' && r.status !== 'researching').length;
                const progress = total > 0 ? (processed / total) * 100 : 0;
                progressBarInner.style.width = `${progress}%`;
                progressText.textContent = `処理中... (${processed}/${total})`;

                if (session.status === 'completed') {
                    console.log('★★★★★ Status is "completed"! Hiding progress and showing results. ★★★★★');
                    clearInterval(intervalId);
                    progressContainer.style.display = 'none';
                    resultsContainer.style.display  = 'block';
                    downloadBtn.href = `/csv/${sessionId}`;
                }
            } catch (e) {
                // ★★★ 追加: フロントエンドでエラーが発生した場合にコンソールに表示 ★★★
                console.error('An error occurred while processing status on the frontend:', e);
                clearInterval(intervalId);
                progressText.textContent = '表示処理中にエラーが発生しました。';
                errorMessage.textContent = '詳細はブラウザの開発者コンソールを確認してください。';
                errorMessage.style.display = 'block';
            }
        })
        .catch(err => {
            // ★★★ 追加: 通信自体のエラーを捕捉 ★★★
            console.error('Failed to fetch status from server:', err);
            clearInterval(intervalId);
            progressText.textContent = 'サーバーとの通信に失敗しました。';
            errorMessage.textContent = 'ネットワーク接続を確認するか、Renderのログを確認してください。';
            errorMessage.style.display = 'block';
        });
    }

    const intervalId = setInterval(checkStatus, 2000);
});
