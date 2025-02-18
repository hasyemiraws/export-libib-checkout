require("dotenv").config();
const axios = require("axios");
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");

const EXPORT_URL = "https://www.libib.com/reports";
const LOGIN_URL = "https://www.libib.com/login";
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const LIBIB_USER = process.env.LIBIB_USER;
const LIBIB_PASS = process.env.LIBIB_PASS;
const PREV_FILE_PATH = "previous.csv";

const downloadPath = "/app/downloads";
const previousCsvPath = path.join(downloadPath, PREV_FILE_PATH);
const loadCSV = (filePath) => {
  if (!fs.existsSync(filePath)) return [];
  const csvContent = fs.readFileSync(filePath, "utf-8");
  return parse(csvContent, { columns: true, skip_empty_lines: true });
};

const checkNewCheckouts = (previousData, newData) => {
  if (newData.length === 0) {
    console.log("🔍 No books are currently checked out. No new data.");
    return [false, []];
  }

  // Convert previousData and newData to Sets of JSON strings for comparison
  const prevSet = new Set(previousData.map((row) => JSON.stringify(row)));

  // Identify newly checked-out books (entries in newData that aren't in previousData)
  const newEntries = newData.filter((row) => !prevSet.has(JSON.stringify(row)));

  // If there are new checkouts, we flag as new data
  if (newEntries.length > 0) {
    console.log("📚 New checkouts detected:", newEntries);
    return [true, newEntries];
  }

  console.log("📌 No new checkouts detected.");
  return [false, []];
};

async function sendToMake(checkouts) {
  const payload = {
    checkouts, // Array of books
    timestamp: new Date().toISOString(),
  };

  try {
    await axios.post(WEBHOOK_URL, payload);
    console.log("✅ Data sent to Make Webhook");
  } catch (error) {
    console.error("❌ Error sending data to Make:", error);
  }
}

(async () => {
  // Ensure the download folder exists
  if (!fs.existsSync(downloadPath)) {
    fs.mkdirSync(downloadPath, { recursive: true });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", `--user-data-dir=${downloadPath}`, "--incognito"],
  });
  const context = browser.defaultBrowserContext();
  const page = (await context.pages())[0];
  await page._client().send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: downloadPath,
  });

  // Login
  await page.goto(LOGIN_URL, { waitUntil: "networkidle2" });
  await page.type('[name="login-email"]', LIBIB_USER);
  await page.click("#login-pre-fetch-submit");

  await page.waitForSelector('[name="login-password"]');
  await page.type('[name="login-password"]', LIBIB_PASS);
  await page.click("#login-submit");
  await page.waitForNavigation();

  // Navigate to export page
  await page.goto(EXPORT_URL, { waitUntil: "networkidle2" });
  const exportButton = await page.$('[data-report="current-checkouts"]');

  await exportButton.click();

  // Wait for file to appear (increase time if necessary)
  await new Promise((resolve) => setTimeout(resolve, 5000));

  // Find the downloaded CSV file
  const files = fs
    .readdirSync(downloadPath)
    .find((file) => file.endsWith(".csv"));

  if (!files) {
    console.log("CSV file not found!");
    await browser.close();
    return;
  }

  // Get exported content
  // const content = await page.evaluate(() => document.body.innerText);
  const csvFile = path.join(downloadPath, files);
  // **Check if file is actually new**
  // Load previous and new CSV data
  const previousData = loadCSV(previousCsvPath);
  const newData = loadCSV(csvFile);

  // Compare and determine if there's new checkouts
  const hasNewData = checkNewCheckouts(previousData, newData);

  if (!fs.existsSync(previousCsvPath)) {
    fs.writeFileSync(previousCsvPath, "");
    fs.copyFileSync(csvFile, previousCsvPath);

    fs.unlinkSync(csvFile);
    await browser.close();
    return;
  }

  // If new data is detected, save the new CSV as the reference
  if (hasNewData[0]) {
    console.log("📂 Updated reference CSV.");
    sendToMake(hasNewData[1]);
  }
  fs.copyFileSync(csvFile, previousCsvPath);

  fs.unlinkSync(csvFile);
  await browser.close();
})();
