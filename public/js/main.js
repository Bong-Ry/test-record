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
        const title     = record.aiData?.Title || 'N/A';
        const isError   = record.status === 'error';

        const conditionOptions      = ['NM', 'EX', 'VG+', 'VG', 'G', 'なし'];
        const conditionOptionsHtml  = conditionOptions.map(opt => `<option value="${opt}">${opt}</option>`).join('');

        const damageOptions   = ['上部(下部)の裂け', '角潰れ', 'シワ', 'シミ', 'ラベル剥がれ'];
        const damageCheckboxes = damageOptions.map(opt =>
            `<label class="checkbox-label"><input type="checkbox" name="jacketDamage" value="${opt}" ${isError ? 'disabled' : ''}> ${opt}</label>`
        ).join('');

        const priceOptions = ['39.99', '29.99', '59.99', '79.99', '99.99'];
        const priceRadios  = priceOptions.map((price, index) =>
            `<label class="radio-label"><input type="radio" name="price-${record.id}" value="${price}" ${index === 0 ? 'checked' : ''} ${isError ? 'disabled' : ''}> ${price} USD</label>`
        ).join('');

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
                        <div class="title-warning" style="display: none;">※80文字以上になっているため修正が必要です。</div>
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
                                <option value="15USD">15USD</option>
                                <option value="25USD">25USD</option>
                                <option value="32USD">32USD</option>
                            </select>
                        </div>
                    </div>
                    <h3 class="section-title">状態</h3>
                    <div class="input-section">
                        <div class="input-group"><label>ジャケットの状態</label><select name="conditionSleeve" ${isError ? 'disabled' : ''}>${conditionOptionsHtml.replace('value="なし"','value="Not Applicable"')}</select></div>
                        <div class="input-group"><label>レコードの状態</label><select name="conditionVinyl" ${isError ? 'disabled' : ''}>${conditionOptionsHtml.replace('value="なし"','value="Not Applicable"')}</select></div>
                        <div class="input-group"><label>OBIの状態</label><select name="obi" ${isError ? 'disabled' : ''}>${conditionOptionsHtml}</select></div>
                    </div>
                    <div class="input-group full-width">
                        <label>ジャケットのダメージについて</label>
                        <div class="checkbox-group">${damageCheckboxes}</div>
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

        const data = {
            title          : row.querySelector('[name="title"]').value,
            price          : row.querySelector(`input[name="price-${recordId}"]:checked`).value,
            shipping       : row.querySelector('[name="shipping"]').value,
            conditionSleeve: row.querySelector('[name="conditionSleeve"]').value,
            conditionVinyl : row.querySelector('[name="conditionVinyl"]').value,
            obi            : row.querySelector('[name="obi"]').value,
            jacketDamage   : jacketDamage,
            comment        : row.querySelector('[name="comment"]').value,
        };

        fetch(`/save/${sessionId}/${recordId}`, {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify(data),
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

        const checkTitleLength = () => {
            titleWarning.style.display = titleInput.value.length > 80 ? 'block' : 'none';
        };

        checkTitleLength();
        titleInput.addEventListener('input', checkTitleLength);
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
