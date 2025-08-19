// app.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ▼▼▼ トップページ（/）へのアクセスに応答する処理を追加 ▼▼▼
app.get('/', (req, res) => {
  // views/index.ejs を表示する
  // （index.ejsが必要とする categories 変数に空の配列を渡しています）
  res.render('index', { categories: [] });
});

// ★ eBayアップロードAPI用のルートを有効化
app.use(require('./routes/recordRoutes'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));

module.exports = app;
