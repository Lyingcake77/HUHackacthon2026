const resultsEl = document.querySelector("#results");
const summaryEl = document.querySelector("#summary");
const readButton = document.querySelector("#read-alt-text");
const nextButton = document.querySelector("#next-alt-text");
const clearButton = document.querySelector("#clear-results");
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let activeTabId = null;
let currentAltTexts = [];
let altResultItems = [];
let currentAltIndex = -1;
let highlightToken = null;

const testUrl = 'https://webhook.site/5dbe555a-7630-4ac1-a445-73fea4867bb8'
function addResult(text) {
  const item = document.createElement("li");
  item.textContent = text;
  resultsEl.appendChild(item);
  return item;
}

async function callUrlEndpoint(url, options = {}) {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json, text/plain, */*",
        ...(options.headers || {})
      },
      ...options
    });

    const responseText = await response.text();
    let parsedBody = responseText;

    try {
      parsedBody = JSON.parse(responseText);
    } catch (error) {
      // Keep plain text when JSON parsing fails.
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      body: parsedBody
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      statusText: "Network Error",
      body: error.message || String(error)
    };
  }
}
async function postUrlEndpoint(url, options = {}) {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json, text/plain, */*",
        ...(options.headers || {})
      },
      ...options
    });

    const responseText = await response.text();
    let parsedBody = responseText;

    try {
      parsedBody = JSON.parse(responseText);
    } catch (error) {
      // Keep plain text when JSON parsing fails.
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      body: parsedBody
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      statusText: "Network Error",
      body: error.message || String(error)
    };
  }
}
async function speakText(text) {
  if (!text || typeof text !== "string") {
    return false;
  }
  // await delay(2000); // Small delay to ensure previous speech has finished
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
    utterance.rate = 1;
    utterance.pitch = 2;
    utterance.volume = 2;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve(); // Fallback if an error occurs
    
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
  


  // const utterance = new SpeechSynthesisUtterance(text);

  

  // window.speechSynthesis.speak(utterance);
  // return true;
}

function readAltTextFromPage() {
  const collected = [];
  const seen = new Set();

  function getElementSelector(element) {
    const parts = [];
    let current = element;

    while (current?.parentElement) {
      const tagName = current.tagName.toLowerCase();
      const siblings = Array.from(current.parentElement.children)
        .filter(sibling => sibling.tagName === current.tagName);
      parts.unshift(`${tagName}:nth-of-type(${siblings.indexOf(current) + 1})`);
      current = current.parentElement;
    }

    return parts.join(" > ");
  }

  function addText(text, element) {
    const key = text.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      collected.push({ text, selector: getElementSelector(element) });
    }
  }

  const imageElements = document.querySelectorAll("img, input[type='image'], area");

  for (const element of imageElements) {
    const alt = (element.getAttribute("alt") || "").trim();
    if (!alt) continue;
    addText(alt, element);
  }

  const labeledElements = document.querySelectorAll("[aria-label]");

  for (const element of labeledElements) {
    const tagName = element.tagName.toLowerCase();
    if (["img", "input", "area"].includes(tagName)) {
      continue;
    }

    const label = (element.getAttribute("aria-label") || "").trim();
    if (!label) continue;
    addText(label, element);
  }

  return collected;
}

function setPageHighlight(selector, token, active) {
  let element = document.querySelector(selector);
  if (!element) return;

  if (element instanceof HTMLAreaElement) {
    const mapName = element.parentElement?.name;
    const mapImage = mapName
      ? document.querySelector(`img[usemap="#${CSS.escape(mapName)}"]`)
      : null;
    if (mapImage) element = mapImage;
  }

  const className = `alt-text-reader-highlight-${token}`;
  const styleId = `alt-text-reader-style-${token}`;

  if (active) {
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      style.textContent = `.${className} { outline: 3px solid #ffcc33 !important; outline-offset: 3px !important; background-color: rgba(255, 220, 70, 0.25) !important; }`;
      document.documentElement.appendChild(style);
    }
    element.classList.add(className);
    element.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  } else {
    element.classList.remove(className);
    document.getElementById(styleId)?.remove();
  }
}

async function removeCurrentHighlight() {
  if (!activeTabId || currentAltIndex < 0 || !highlightToken) {
    return;
  }

  await browser.scripting.executeScript({
    target: { tabId: activeTabId },
    func: setPageHighlight,
    args: [currentAltTexts[currentAltIndex].selector, highlightToken, false]
  });
}

async function getImageDataFromPage(selector = "img") {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.id) {
    throw new Error("No active tab was found.");
  }

  const [{ result }] = await browser.scripting.executeScript({
    target: { tabId: tab.id },
    func: (targetSelector) => {
      const image = document.querySelector(targetSelector) || document.querySelector("img");
      if (!image) {
        return null;
      }

      const source = image.currentSrc || image.src;
      if (!source) {
        return null;
      }

      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const context = canvas.getContext("2d");
          context.drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = () => resolve(null);
        img.src = source;
      });
    },
    args: [selector]
  });

  return result; // returns a base64 data URL like data:image/png;base64,...
}

async function sendImageToEndpoint(imageDataUrl, endpointUrl = "http://127.0.0.1:11434/api/chat") {
  if (!imageDataUrl) {
    throw new Error("No image data was provided.");
  }
  const imageBase64 = imageDataUrl.replace(/^data:image\/[^;]+;base64,/, "");
  const result = await postUrlEndpoint(endpointUrl, {
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
    model: "gemma3:4b",
    messages: [
      {
        role: "user",
        content: "Describe this image.",
        images: [imageBase64]
      }
    ],
      stream: false
    })
  });

  if (!result.ok) {
    throw new Error(`Request failed (${result.status || result.statusText}): ${result.body}`);
  }

  return result.body;
}

async function readPageAltText() {
//   speakText("Reading alt text from the current page.");
  // speakText((await callUrlEndpoint("http://localhost:11434")).body)
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.id) {
    summaryEl.textContent = "No active tab was found.";
    return;
  }

  readButton.disabled = true;
  nextButton.disabled = true;
  summaryEl.textContent = "Reading alt text and sending image to endpoint...";
  resultsEl.innerHTML = "";

  try {
    await removeCurrentHighlight();
    currentAltTexts = [];
    altResultItems = [];
    currentAltIndex = -1;
    activeTabId = tab.id;
    highlightToken = null;

    const imageDataUrl = await getImageDataFromPage("img");
    if (imageDataUrl) {
      const response = await sendImageToEndpoint(imageDataUrl);
      const message = response?.message?.content || response?.content || "No response returned.";
      addResult(`Image analysis: ${message}`);
      await speakText(message);
    }

    const injection = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: readAltTextFromPage
    });

    const altTexts = injection?.[0]?.result || [];

    if (!altTexts.length) {
      addResult("No alt text found on the current page.");
      summaryEl.textContent = "No alt text was found on this page.";
      return;
    }

    currentAltTexts = altTexts;
    highlightToken = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    for (const entry of currentAltTexts) {
      altResultItems.push(addResult(entry.text));
    }

    summaryEl.textContent = `${currentAltTexts.length} alt text entries found. Reading the first entry.`;
    await goToNextAltText();
  } catch (error) {
    addResult(`Error reading alt text: ${error.message || String(error)}`);
    summaryEl.textContent = "Unable to read alt text from this page.";
  } finally {
    readButton.disabled = false;
  }
}

async function goToNextAltText() {
  if (!activeTabId || currentAltIndex >= currentAltTexts.length - 1) {
    nextButton.disabled = true;
    return;
  }

  window.speechSynthesis.cancel();
  const previousIndex = currentAltIndex;
  currentAltIndex += 1;
  const entry = currentAltTexts[currentAltIndex];
  const resultItem = altResultItems[currentAltIndex];

  if (previousIndex >= 0) {
    const previousEntry = currentAltTexts[previousIndex];
    altResultItems[previousIndex]?.classList.remove("speaking");
    await browser.scripting.executeScript({
      target: { tabId: activeTabId },
      func: setPageHighlight,
      args: [previousEntry.selector, highlightToken, false]
    });
  }

  resultItem?.classList.add("speaking");
  await browser.scripting.executeScript({
    target: { tabId: activeTabId },
    func: setPageHighlight,
    args: [entry.selector, highlightToken, true]
  });
  nextButton.disabled = currentAltIndex >= currentAltTexts.length - 1;
  summaryEl.textContent = `Alt text ${currentAltIndex + 1} of ${currentAltTexts.length}.`;
  await speakText(entry.text);
  resultItem?.classList.remove("speaking");
}

async function clearResults() {
  window.speechSynthesis.cancel();
  let highlightError = null;
  try {
    await removeCurrentHighlight();
  } catch (error) {
    highlightError = error;
  }

  resultsEl.innerHTML = '<li class="empty">No results yet.</li>';
  summaryEl.textContent = highlightError
    ? `Unable to remove the page highlight: ${highlightError.message || String(highlightError)}`
    : "Ready. Click to read alt text from the active page.";
  currentAltTexts = [];
  altResultItems = [];
  currentAltIndex = -1;
  activeTabId = null;
  highlightToken = null;
  nextButton.disabled = true;
}

readButton.addEventListener("click", readPageAltText);
nextButton.addEventListener("click", () => {
  goToNextAltText().catch(error => {
    addResult(`Error moving to next alt text: ${error.message || String(error)}`);
    summaryEl.textContent = "Unable to move to the next alt text.";
    nextButton.disabled = true;
  });
});
clearButton.addEventListener("click", clearResults);
clearResults();
