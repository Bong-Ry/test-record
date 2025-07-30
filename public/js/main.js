document.addEventListener('DOMContentLoaded', () => {
    if (typeof sessionId === 'undefined') return;

    const tableBody          = document.querySelector('#results-table tbody');
    const modal              = document.getElementById('image-modal');
    const modalImg           = document.getElementById('modal-image');
    const modalClose         = document.querySelector('.modal-close');
    const progressContainer  = document.getElementById('progress-container');
    const progressBarInner   = document.querySelector('.progress-bar-inner');
    const resultsContainer   = document.getElementById('results-table-container');
    const downloadBtn        = document.getElementById('download-csv-btn');

    function createRow(record) {
        const j1Image   = record.images?.find(img => img.name.startsWith('J1_'));
        const mainImage = j1Image || (record.images && record.images.length > 0 ? record.images[0] : null);
        const imageUrl  = mainImage ? `/image/${mainImage.id}` : 'https://via.placeholder.com/120';

        const sku       = record.customLabel || '';
        const title = (record.aiData?.Title && record.aiData?.Artist)
            ? `${record.aiData.Title} ${record.aiData.Artist}`
            : (record.aiData?.Title || 'N/A');
        const isError   = record.status === 'error';

        const conditionOptions      = ['NM', 'EX', 'VG+', 'VG', 'G', 'なし'];
        const conditionOptionsHtml  = conditionOptions.map(opt => `<option value="${opt}">${opt}</option>`).join('');

        const damageOptions   = ['上部(下部)の裂け', '角潰れ', 'シワ', 'シミ', 'ラベル剥がれ'];
        const damageCheckboxes = damageOptions.map(opt =>
            `<label class="checkbox-label"><input type="checkbox" name="jacketDamage" value="${opt}" ${isError ? 'disabled' : ''}> ${opt}</label>`
        ).join('');

        // ③価格のラジオボタンについて (start)
        const priceOptions = ['39.99', '29.99', '59.99', '79.99', '99.99'];
        let priceRadios  = priceOptions.map((price, index) =>
            `<label class="radio-label"><input type="radio" name="price-${record.id}" value="${price}" ${index === 0 ? 'checked' : ''} ${isError ? 'disabled' : ''}> ${price} USD</label>`
        ).join('');
        // 「その他」のラジオボタンと入力欄を追加
        priceRadios += `
            <label class="radio-label">
                <input type="radio" name="price-${record.id}" value="other" ${isError ? 'disabled' : ''}> その他
                <input type="number" name="other-price-${record.id}" class="other-price-input" placeholder="価格を入力" style="display: none;" ${isError ? 'disabled' : ''}>
            </label>
        `;
        // ③価格のラジオボタンについて (end)

        // サーバーから渡されたカテゴリー情報とデフォルトカテゴリーを使ってプルダウンを生成
        const categoriesHtml = record.categories ? record.categories.map(cat =>
            `<option value="${cat.code}" ${cat.code === defaultCategory ? 'selected' : ''}>${cat.name}</option>`
        ).join('') : '';

        // ①送料のプルダウンについて (start)
        // USDを削除し、スプレッドシートの値をそのまま表示
        const shippingOptionsHtml = shippingOptions.map(opt => `<option value="${opt}">${opt}</option>`).join('');
        // ①送料のプルダウンについて (end)

        return `
            <tr id="row-${record.id}" data-record-id="${record.id}" class="record-row">
                <td class="status-cell">${isError ? `❌` : `<span id="status-${record.id}">...</span>`}</td>
                <td class="image-cell"><img src="${imageUrl}" alt="Record Image" class="main-record-image"></td>
                <td class="info-cell">
                    <div class="info-input-group">
                        <label>SKU</label>
                        <span class="sku-display">${sku}</span>
                    </div>
                    <div class="info-input-group">
                        <label>タイトル</label>
                        <textarea name="title" rows="4" class="title-input">${title}</textarea>
                        <div class="title-warning" style="display: none;"></div>
                    </div>
                </td>
                <td class="input-cell">
                    <div class="input-section">
                        <div class="input-group full-width">
                            <label>価格</label>
                            <div class="radio-group compact">${priceRadios}</div>
                        </div>
                        <div class="input-group">
                            <label>送料</label>
                            <select name="shipping" ${isError ? 'disabled' : ''}>
                                ${shippingOptionsHtml}
                            </select>
                        </div>
                        <div class="input-group">
                            <label>商品の状態</label>
                            <select name="productCondition" ${isError ? 'disabled' : ''}>
                                <option value="中古">中古</option>
                                <option value="新品">新品</option>
                            </select>
                        </div>
                    </div>
                    <h3 class="section-title">状態</h3>
                    <div class="input-section">
                        <div class="input-group"><label>ジャケットの状態</label><select name="conditionSleeve" ${isError ? 'disabled' : ''}>${conditionOptionsHtml.replace('value="なし"','value="Not Applicable"')}</select></div>
                        <div class="input-group"><label>レコードの状態</label><select name="conditionVinyl" ${isError ? 'disabled' : ''}>${conditionOptionsHtml.replace('value="なし"','value="Not Applicable"')}</select></div>
                        <div class="input-group"><label>OBIの状態</label><select name="obi" class="obi-select" ${isError ? 'disabled' : ''}>${conditionOptionsHtml}</select></div>
                    </div>
                    <div class="input-group full-width">
                        <label>ジャケットのダメージについて</label>
                        <div class="checkbox-group">${damageCheckboxes}</div>
                    </div>
                    <h3 class="section-title">カテゴリー</h3>
                     <div class="input-group full-width">
                        <label>カテゴリー</label>
                        <select name="category" ${isError ? 'disabled' : ''}>
                           ${categoriesHtml}
                        </select>
                    </div>
                    <div class="input-group full-width" style="margin-top: 15px;">
                        <label>コメント</label>
                        <textarea name="comment" rows="3" ${isError ? 'disabled' : ''}></textarea>
                    </div>
                </td>
                <td class="action-cell">
                    <button class="btn btn-save" ${isError ? 'disabled' : ''}>保存</button>
                </td>
            </tr>`;
    }

    function handleSave(event) {
        const row       = event.target.closest('tr');
        const recordId  = row.dataset.recordId;
        const statusEl  = document.getElementById(`status-${recordId}`);

        const jacketDamageNodes = row.querySelectorAll('input[name="jacketDamage"]:checked');
        const jacketDamage      = Array.from(jacketDamageNodes).map(node => node.value);

        // ③価格のラジオボタンについて (start)
        const selectedPriceRadio = row.querySelector(`input[name="price-${recordId}"]:checked`);
        let price;
        if (selectedPriceRadio.value === 'other') {
            price = row.querySelector(`input[name="other-price-${recordId}"]`).value;
        } else {
            price = selectedPriceRadio.value;
        }
        // ③価格のラジオボタンについて (end)

        const data = {
            title:            row.querySelector('[name="title"]').value,
            price:            price, // 修正後の価格
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
                downloadBtn.style.display = 'inline-block';
            }
        });
    }

    function setupEventListeners(row) {
        row.querySelector('.btn-save').addEventListener('click', handleSave);
        row.querySelector('.main-record-image').addEventListener('click', e => {
            modal.style.display = 'flex';
            modalImg.src = e.target.src;
        });

        const titleInput   = row.querySelector('textarea[name="title"]');
        const titleWarning = row.querySelector('.title-warning');
        const obiSelect    = row.querySelector('.obi-select');

        const checkTitleLength = () => {
            const obiValue = obiSelect.value;
            const maxLength = (obiValue === 'なし') ? 80 : 74;
            if (titleInput.value.length > maxLength) {
                titleWarning.textContent = `※${maxLength}文字の制限を超えています。`;
                titleWarning.style.display = 'block';
            } else {
                titleWarning.style.display = 'none';
            }
        };

        checkTitleLength();
        titleInput.addEventListener('input', checkTitleLength);
        obiSelect.addEventListener('change', checkTitleLength);

        // ③価格のラジオボタンについて (start)
        // 「その他」価格入力のイベントリスナー
        const recordId = row.dataset.recordId;
        const priceRadios = row.querySelectorAll(`input[name="price-${recordId}"]`);
        const otherPriceInput = row.querySelector(`input[name="other-price-${recordId}"]`);
        priceRadios.forEach(radio => {
            radio.addEventListener('change', () => {
                if (radio.value === 'other') {
                    otherPriceInput.style.display = 'inline-block';
                } else {
                    otherPriceInput.style.display = 'none';
                }
            });
        });
        // ③価格のラジオボタンについて (end)
    }

    modalClose.onclick = () => { modal.style.display = 'none'; };
    window.onclick     = event => { if (event.target === modal) modal.style.display = 'none'; };

    function checkStatus() {
        fetch(`/status/${sessionId}`)
        .then(res => res.json())
        .then(session => {
            if (!session || !session.records) return;

            session.records.forEach(record => {
                let row = document.getElementById(`row-${record.id}`);
                if (!row && record.status !== 'pending') {
                    record.categories = session.categories;
                    tableBody.insertAdjacentHTML('beforeend', createRow(record));
                    row = document.getElementById(`row-${record.id}`);
                    setupEventListeners(row);
                }
            });

            if (session.status === 'completed') {
                clearInterval(intervalId);
                progressContainer.style.display = 'none';
                resultsContainer.style.display  = 'block';
                downloadBtn.href = `/csv/${sessionId}`;
            } else {
                const total      = session.records.length;
                const processed  = session.records.filter(r => r.status !== 'pending').length;
                const progress   = total > 0 ? (processed / total) * 100 : 0;
                progressBarInner.style.width = `${progress}%`;
            }
        });
    }

    const intervalId = setInterval(checkStatus, 2000);
});
