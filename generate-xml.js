const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs-extra');
const xml2js = require('xml2js');
const axios = require('axios');

puppeteer.use(StealthPlugin());

const RSS_URL = 'https://samakal.com/rss';
const OUTPUT_DIR = './feeds';
const MAX_ARTICLES = 500;

async function fetchXML() {
  const response = await axios.get(RSS_URL);
  return response.data;
}

async function parseXML(xmlString) {
  const parser = new xml2js.Parser({ explicitArray: true });
  return parser.parseStringPromise(xmlString);
}

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

async function buildXML(items) {
  const builder = new xml2js.Builder({ cdata: true });
  return builder.buildObject({ rss: { channel: [{ item: items }] } });
}

async function filterAndAppend(feedData, keyword, filename) {
  let newItems = feedData.rss.channel[0].item || [];
  newItems = newItems.filter(item => item.link[0].includes(keyword));

  const filePath = `${OUTPUT_DIR}/${filename}`;
  const existingItems = await readExistingXML(filePath);

  // Avoid duplicates based on link
  const existingLinks = new Set(existingItems.map(i => i.link[0]));
  const uniqueNewItems = newItems.filter(item => !existingLinks.has(item.link[0]));

  // Prepend newest items
  let combinedItems = [...uniqueNewItems, ...existingItems];

  // Limit to MAX_ARTICLES
  if (combinedItems.length > MAX_ARTICLES) {
    combinedItems = combinedItems.slice(0, MAX_ARTICLES);
  }

  const xmlOutput = await buildXML(combinedItems);
  await fs.ensureDir(OUTPUT_DIR);
  await fs.writeFile(filePath, xmlOutput, 'utf-8');
  console.log(`Appended to ${filename}. Total articles: ${combinedItems.length}`);
}

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