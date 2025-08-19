// app.js
require('dotenv').config();
const express = require('express');
const path = require('path');
const recordRoutes = require('./routes/recordRoutes'); // 名前を合わせる

const app = express();
const PORT = process.env.PORT || 3000;

// 複数フォルダの処理状況をサーバー上で一時的に管理します
const sessions = new Map();

// View Engine Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ルーターにセッション管理機能を渡します
const router = recordRoutes(sessions); // sessions を渡す
app.use('/', router);

// Start Server
app.listen(PORT, () => {
    console.log(`Record Lister app listening on port ${PORT}`);
});

module.exports = app;
