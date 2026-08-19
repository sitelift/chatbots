'use strict';

const { AppError } = require('./errors');
const config = require('./config');

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&#(\d+);/g, (m, code) => {
      const n = parseInt(code, 10);
      return n >= 32 && n <= 126 ? String.fromCharCode(n) : ' ';
    })
    .replace(/&#x([0-9a-f]+);/gi, (m, hex) => {
      const n = parseInt(hex, 16);
      return n >= 32 && n <= 126 ? String.fromCharCode(n) : ' ';
    })
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

async function fetchPageText(url) {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
    throw new AppError(400, 'SCRAPE_FAILED', 'Invalid URL. Must be http(s).');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  let html;
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'SiteLiftBot/1.0' },
    });
    if (!res.ok) {
      throw new AppError(400, 'SCRAPE_FAILED', 'The URL returned an error status.');
    }
    html = await res.text();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(400, 'SCRAPE_FAILED', 'Could not fetch the URL.');
  } finally {
    clearTimeout(timer);
  }

  const text = stripTags(html);
  if (!text) {
    throw new AppError(400, 'SCRAPE_FAILED', 'No readable text found on that page.');
  }
  return text.slice(0, config.scrapeMaxChars);
}

module.exports = { fetchPageText };
