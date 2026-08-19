const { AppError } = require('../errors');

const TIMEOUT_MS = 30 * 1000;

function providerError() {
  return new AppError(502, 'AI_PROVIDER_ERROR', 'The AI provider request failed.');
}

async function chatCompletion({ baseUrl, apiKey, model, messages, temperature, maxTokens }) {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    throw providerError();
  }

  clearTimeout(timeout);

  let text;
  try {
    text = await res.text();
  } catch (err) {
    throw providerError();
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    if (!res.ok) {
      console.error(`AI provider request failed with status ${res.status}`);
    } else {
      console.error(`AI provider returned invalid JSON (status ${res.status}): ${text.slice(0, 300)}`);
    }
    throw providerError();
  }

  if (!res.ok) {
    console.error(`AI provider request failed with status ${res.status}: ${text.slice(0, 300)}`);
    throw providerError();
  }

  const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (typeof content !== 'string') {
    throw providerError();
  }

  return content;
}

module.exports = { chatCompletion };
