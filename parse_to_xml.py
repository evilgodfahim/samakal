import sys
import os
from bs4 import BeautifulSoup
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

HTML_FILE = "opinion.html"
XML_FILE = "articles.xml"
MAX_ITEMS = 500

# Bangladesh Standard Time (UTC+6)
BD_TZ = timezone(timedelta(hours=6))

def parse_and_format_date(date_input):
    """
    Robustly parses a date by translating Bengali text/numerals to English,
    stripping garbage text, and returning a standard RSS-compliant string.
    Returns: (datetime_object, formatted_rss_string) or (None, None)
    """
    if not date_input:
        return None, None

    date_str = str(date_input).strip()
    
    # 1. Translate Bengali numerals to English numerals
    bengali_to_english_digits = str.maketrans('০১২৩৪৫৬৭৮৯', '0123456789')
    date_str = date_str.translate(bengali_to_english_digits)
    
    # 2. Map Bengali text to English equivalents & strip garbage chars
    replacements = {
        "জানুয়ারি": "Jan", "ফেব্রুয়ারি": "Feb", "মার্চ": "Mar", "এপ্রিল": "Apr",
        "মে": "May", "জুন": "Jun", "জুলাই": "Jul", "আগস্ট": "Aug",
        "সেপ্টেম্বর": "Sep", "অক্টোবর": "Oct", "নভেম্বর": "Nov", "ডিসেম্বর": "Dec",
        "এএম": "AM", "পিএম": "PM",
        "আপডেটঃ": "", "আপডেট:": "", "|": "", ",": ""
    }
    
    for bengali_word, english_word in replacements.items():
        date_str = date_str.replace(bengali_word, english_word)
        
    # Clean up extra spaces left over from replacing strings
    date_str = " ".join(date_str.split())

    dt = None
    
    # Standard format attempts
    formats = [
        "%d %b %Y %I:%M %p", # e.g., 14 Apr 2026 12:00 AM
        "%d %b %Y %H:%M",    # e.g., 05 Jun 2026 07:48
        "%Y-%m-%d %H:%M:%S",
        "%d %b %Y %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S%z",
        "%d/%m/%Y %H:%M"
    ]

    for fmt in formats:
        try:
            dt = datetime.strptime(date_str, fmt)
            break
        except ValueError:
            continue
            
    # Try ISO fallback if it still hasn't parsed
    if not dt:
        try:
            clean_str = date_str.replace("Z", "+00:00")
            dt = datetime.fromisoformat(clean_str)
        except ValueError:
            pass

    if not dt:
        print(f"  [!] Could not parse cleaned date string: {date_str} (Original: {date_input})")
        return None, None

    # Attach BD Timezone (+6) if none exists
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=BD_TZ)

    # Format the date into strict RFC-2822 RSS format
    rss_date_str = dt.strftime("%a, %d %b %Y %H:%M:%S %z")
    return dt, rss_date_str


# Load HTML
if not os.path.exists(HTML_FILE):
    print("HTML not found")
    sys.exit(1)

with open(HTML_FILE, "r", encoding="utf-8") as f:
    soup = BeautifulSoup(f.read(), "html.parser")

articles = []
now = datetime.now(BD_TZ)

# --- Define a helper function to avoid repeating the extraction code ---
def extract_blocks(selector):
    for block in soup.select(selector):
        url = block.get("href")
        
        # Title
        h_tag = block.select_one("h1, h3")
        title = h_tag.get_text(strip=True) if h_tag else None
        if not title: continue
        
        # Description
        desc_tag = block.select_one("p.CatDesc, p")
        desc = desc_tag.get_text(strip=True) if desc_tag else ""
        
        # Publish Date parsing & formatting
        pub_tag = block.select_one(".publishTime")
        raw_pub = pub_tag.get_text(strip=True) if pub_tag else ""
        
        dt, rss_pub_str = parse_and_format_date(raw_pub)
        
        # --- Time Check Filter ---
        if not dt or (now - dt) > timedelta(hours=25):
            continue

        img_tag = block.select_one("img")
        img = img_tag.get("src", "") if img_tag else ""
        
        articles.append({
            "url": url, 
            "title": title, 
            "desc": desc, 
            "pub": rss_pub_str, # Using the CLEANED RSS string, not the raw text
            "img": img
        })

# Extract from all 3 classes
extract_blocks("div.DCatLead a[href*='/opinion/article/']")
extract_blocks("div.Catcards a[href*='/opinion/article/']")
extract_blocks("div.CatListNews a[href*='/opinion/article/']")

print(f"Total recent unique articles collected: {len(articles)}")

# --- Load or create XML ---
if os.path.exists(XML_FILE):
    try:
        tree = ET.parse(XML_FILE)
        root = tree.getroot()
    except ET.ParseError:
        root = ET.Element("rss", version="2.0")
else:
    root = ET.Element("rss", version="2.0")

channel = root.find("channel")
if channel is None:
    channel = ET.SubElement(root, "channel")
    ET.SubElement(channel, "title").text = "Samakal Opinion"
    ET.SubElement(channel, "link").text = "https://samakal.com/opinion"
    ET.SubElement(channel, "description").text = "Latest opinion articles from Samakal"

existing = set()
for item in channel.findall("item"):
    link_tag = item.find("link")
    if link_tag is not None:
        existing.add(link_tag.text.strip())

new_count = 0
for art in articles:
    if art["url"] in existing:
        continue
        
    item = ET.SubElement(channel, "item")
    ET.SubElement(item, "title").text = art["title"]
    ET.SubElement(item, "link").text = art["url"]
    ET.SubElement(item, "description").text = art["desc"]
    
    # We now safely inject the properly formatted RSS string 
    ET.SubElement(item, "pubDate").text = art["pub"]
    
    if art["img"]:
        ET.SubElement(item, "enclosure", url=art["img"], type="image/jpeg")
    
    new_count += 1

print(f"Added {new_count} new articles to XML.")

all_items = channel.findall("item")
if len(all_items) > MAX_ITEMS:
    for old_item in all_items[:-MAX_ITEMS]:
        channel.remove(old_item)

tree = ET.ElementTree(root)
tree.write(XML_FILE, encoding="utf-8", xml_declaration=True)
print(f"XML saved with {len(channel.findall('item'))} total articles")