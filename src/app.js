const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cors = require('cors');

const productRoutes = require('./routes/productRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const userRoutes = require('./routes/userRoutes');
const orderRoutes = require('./routes/orderRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const { getDB } = require('./database');

require('./config/passport/passport');

const originalConsoleLog = console.log;

console.log = (...args) => {
  const currentDateTime = new Date().toLocaleString();
  originalConsoleLog(`[${currentDateTime}]`, ...args);
};

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Origins allowed to call the API. Set CORS_ORIGIN to a comma-separated list
// to override. Any localhost port is accepted outside production so the app
// can be run locally without configuration.
const allowedOrigins = (
  process.env.CORS_ORIGIN || 'https://bbad-shop.netlify.app'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true); // curl, health checks
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (
        process.env.NODE_ENV !== 'production' &&
        /^http:\/\/localhost:\d+$/.test(origin)
      ) {
        return callback(null, true);
      }
      callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
  })
);

app.use('/images', express.static('./images', { maxAge: 86400 }));
app.use('/api/product', productRoutes);
app.use('/api/category', categoryRoutes);
app.use('/api/user', userRoutes);
app.use('/api/order', orderRoutes);
app.use('/api/review', reviewRoutes);

// Readiness check: answers only once the data source responds, so a deployment
// whose database is unreachable reports as unhealthy instead of "successful".
app.get('/api/checkConnection', async (req, res) => {
  try {
    await getDB().collection('Products').countDocuments();
    res
      .status(200)
      .json({ isConnect: true, message: 'Connection is successful.' });
  } catch (error) {
    console.error('Readiness check failed:', error);
    res
      .status(503)
      .json({ isConnect: false, message: 'Data source is unavailable.' });
  }
});

module.exports = app;
