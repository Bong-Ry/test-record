require('dotenv').config();
const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const recordRoutes = require('./routes/recordRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// 一時データをサーバーメモリで管理するためのMap
const sessions = new Map();

// View Engine Setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
// ルーターにセッション管理用のMapを渡す
app.use('/', recordRoutes(sessions));

// Start Server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
