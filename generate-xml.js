const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs-extra');
const xml2js = require('xml2js');
const axios = require('axios');

puppeteer.use(StealthPlugin());

// Use your Worker URL as the RSS source
const RSS_URL = 'https://shrill-hall-01a0.srkfahim23.workers.dev/?url=https://samakal.com/rss';
const OUTPUT_DIR = './feeds';
const MAX_ARTICLES = 500;

// Fetch XML from Worker
async function fetchXML() {
  const response = await axios.get(RSS_URL);
  return response.data;
}

// Parse XML string to JS object
async function parseXML(xmlString) {
  const parser = new xml2js.Parser({ explicitArray: true });
  return parser.parseStringPromise(xmlString);
}

// Read existing XML feed file
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

// Build XML string from JS object with proper namespaces
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

// Filter new articles and append to existing feed
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

// Main execution
async function main() {
  try {
    const xmlString = await fetchXML();
    const feedData = await parseXML(xmlString);

    await filterAndAppend(feedData, '/international/', 'international.xml');
    await filterAndAppend(feedData, '/opinion/', 'opinion.xml');
  } catch (err) {
    console.error('Error:', err);
  }
}

main();