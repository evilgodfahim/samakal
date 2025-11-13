const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs-extra');
const xml2js = require('xml2js');
const axios = require('axios');

puppeteer.use(StealthPlugin());

const RSS_URL = 'https://samakal.com/rss';
const OUTPUT_DIR = './feeds';
const MAX_ARTICLES = 500;

// ============================================================
// 1. Fetch XML from RSS with error classification
// ============================================================
async function fetchXML() {
  try {
    const response = await axios.get(RSS_URL, {
      timeout: 15000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8'
      },
      validateStatus: () => true // allow manual error handling
    });

    // --- Check HTTP status-based anti-bot cases ---
    if ([403, 429].includes(response.status)) {
      throw new Error(`AntiBotDetected: HTTP ${response.status} - ${response.statusText}`);
    }

    // --- Check Cloudflare / CAPTCHA pattern ---
    const bodyLower = response.data.toLowerCase();
    if (
      bodyLower.includes('cloudflare') ||
      bodyLower.includes('captcha') ||
      bodyLower.includes('verify you are human') ||
      bodyLower.includes('access denied')
    ) {
      throw new Error('AntiBotDetected: CAPTCHA or Cloudflare challenge detected');
    }

    // --- Generic HTTP failure ---
    if (response.status >= 400) {
      throw new Error(`FetchFailed: HTTP ${response.status} - ${response.statusText}`);
    }

    // --- Normal success ---
    return response.data;
  } catch (err) {
    // --- IP / Network Layer Problems ---
    if (err.code === 'ECONNREFUSED' || err.code === 'EHOSTUNREACH') {
      console.error('FetchError: Network unreachable or IP blocked.');
    } else if (err.code === 'ETIMEDOUT') {
      console.error('FetchError: Connection timed out — possibly rate limited or blocked.');
    } else if (err.message.includes('AntiBotDetected')) {
      console.error('FetchError: Anti-bot protection triggered.');
    } else if (err.message.includes('FetchFailed')) {
      console.error('FetchError: Server responded with error code.');
    } else {
      console.error('FetchError: Unknown cause, could be DNS or server offline.');
    }

    // --- Log full technical details ---
    console.error('Detailed error message:', err.message || err);
    throw err;
  }
}

// ============================================================
// 2. Parse XML string to JavaScript object
// ============================================================
async function parseXML(xmlString) {
  const parser = new xml2js.Parser({ explicitArray: true });
  return parser.parseStringPromise(xmlString);
}

// ============================================================
// 3. Read existing XML feed file
// ============================================================
async function readExistingXML(filePath) {
  try {
    if (await fs.pathExists(filePath)) {
      const data = await fs.readFile(filePath, 'utf-8');
      const parsed = await parseXML(data);
      return parsed.rss.channel[0].item || [];
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err);
  }
  return [];
}

// ============================================================
// 4. Build XML string from JavaScript object
// ============================================================
async function buildXML(items) {
  const builder = new xml2js.Builder({
    cdata: true,
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    renderOpts: { pretty: true }
  });

  const rssObject = {
    rss: {
      $: {
        version: '2.0',
        'xmlns:content': 'http://purl.org/rss/1.0/modules/content/',
        'xmlns:dc': 'http://purl.org/dc/elements/1.1/'
      },
      channel: [{ item: items }]
    }
  };

  return builder.buildObject(rssObject);
}

// ============================================================
// 5. Filter and append new items
// ============================================================
async function filterAndAppend(feedData, keyword, filename) {
  let newItems = feedData.rss.channel[0].item || [];
  newItems = newItems.filter(item => item.link[0].includes(keyword));

  const filePath = `${OUTPUT_DIR}/${filename}`;
  const existingItems = await readExistingXML(filePath);

  const existingLinks = new Set(existingItems.map(i => i.link[0]));
  const uniqueNewItems = newItems.filter(item => !existingLinks.has(item.link[0]));

  let combinedItems = [...uniqueNewItems, ...existingItems];
  if (combinedItems.length > MAX_ARTICLES) {
    combinedItems = combinedItems.slice(0, MAX_ARTICLES);
  }

  const xmlOutput = await buildXML(combinedItems);
  await fs.ensureDir(OUTPUT_DIR);
  await fs.writeFile(filePath, xmlOutput, 'utf-8');
  console.log(`Appended to ${filename}. Total articles: ${combinedItems.length}`);
}

// ============================================================
// 6. Main Execution
// ============================================================
async function main() {
  try {
    console.log('Fetching RSS feed...');
    const xmlString = await fetchXML();

    console.log('Parsing XML data...');
    const feedData = await parseXML(xmlString);

    console.log('Processing and saving feeds...');
    await filterAndAppend(feedData, '/international/', 'international.xml');
    await filterAndAppend(feedData, '/opinion/', 'opinion.xml');

    console.log('Completed successfully.');
  } catch (err) {
    console.error('Main process halted due to error.');
  }
}

main();