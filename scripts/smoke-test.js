/**
 * Smoke test: checks that a running API actually serves data.
 *
 * This exists because the deployment once spent months answering requests with
 * an empty catalogue. The process was alive, so nothing looked wrong from the
 * outside — the database behind it had gone away. These checks read real data
 * through real endpoints, which is the only way that failure shows up.
 *
 * Usage:
 *   node scripts/smoke-test.js
 *   SMOKE_BASE_URL=https://bbad-store-backend.onrender.com node scripts/smoke-test.js
 *
 * Exits non-zero on the first failed expectation.
 */

const BASE_URL = (
  process.env.SMOKE_BASE_URL || 'http://localhost:10000'
).replace(/\/$/, '');

const DEMO_EMAIL = process.env.SMOKE_EMAIL || 'fizri@bbad.com';
const DEMO_PASSWORD = process.env.SMOKE_PASSWORD || '12341234';

const results = [];

async function check(name, run) {
  try {
    const detail = await run();
    results.push({ name, ok: true, detail });
    console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
    console.log(`  FAIL  ${name} — ${error.message}`);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function get(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

async function post(path, payload) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

async function main() {
  console.log(`Smoke testing ${BASE_URL}\n`);

  let firstProductId = null;

  await check('readiness endpoint reports the data source is reachable', async () => {
    const { status, body } = await get('/api/checkConnection');
    expect(status === 200, `expected 200, got ${status}`);
    expect(body.isConnect === true, 'isConnect was not true');
    return 'reachable';
  });

  await check('category list is populated', async () => {
    const { status, body } = await get('/api/category/getCategoryList&Lastpage');
    expect(status === 200, `expected 200, got ${status}`);
    const keys = Object.keys(body).filter((key) => key !== 'all');
    expect(keys.length > 0, 'no categories returned');
    return `${keys.length} categories`;
  });

  await check('product list returns products', async () => {
    const { status, body } = await get('/api/product/getProductsList/all/1');
    expect(status === 200, `expected 200, got ${status}`);
    expect(Array.isArray(body), 'response was not an array');
    expect(body.length > 0, 'product list was empty');
    const [product] = body;
    expect(product.product_name, 'first product has no product_name');
    expect(product.product_price >= 0, 'first product has no price');
    firstProductId = product._id;
    return `${body.length} products on page 1`;
  });

  await check('product detail resolves by id', async () => {
    expect(firstProductId, 'skipped: no product id from the list check');
    const { status, body } = await get(
      `/api/product/getProductById/${firstProductId}`
    );
    expect(status === 200, `expected 200, got ${status}`);
    expect(body.product_name, 'no product_name in the response');
    return body.product_name;
  });

  await check('recommended products are returned', async () => {
    const { status, body } = await get('/api/product/getRecommendProduct');
    expect(status === 200, `expected 200, got ${status}`);
    expect(body.isSuccess === true, body.message || 'isSuccess was not true');
    expect(body.data.length > 0, 'no recommended products');
    return `${body.data.length} products`;
  });

  await check('a demo account can sign in', async () => {
    const { status, body } = await post('/api/user/login', {
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    expect(status === 200, `expected 200, got ${status}`);
    expect(body.token, 'no token in the response');
    return DEMO_EMAIL;
  });

  await check('a wrong password is rejected', async () => {
    const { status } = await post('/api/user/login', {
      email: DEMO_EMAIL,
      password: 'definitely-not-the-password',
    });
    expect(status === 403, `expected 403, got ${status}`);
    return 'rejected with 403';
  });

  const failed = results.filter((result) => !result.ok);
  console.log(
    `\n${results.length - failed.length}/${results.length} checks passed`
  );

  if (failed.length > 0) {
    console.error('\nSmoke test failed:');
    for (const result of failed) console.error(`  - ${result.name}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('\nSmoke test could not run:', error.message);
  process.exit(1);
});
