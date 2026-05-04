import puppeteer from 'puppeteer';
import url from "url";
import fs from "fs";
import fetch from "node-fetch";
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const TIMEOUT = 90000;

const currentDir = dirname(fileURLToPath(import.meta.url));
console.log(currentDir);
console.log(new Date());
//const credentials = JSON.parse(fs.readFileSync(currentDir + "/credentials.json"));

const credentials = {
  "client_id": process.env.CLIENT_ID,
  "client_secret": process.env.CLIENT_SECRET,
  "login": process.env.LOGIN,
  "password": process.env.PASSWORD
}

async function gettokens() {
  console.log('open browser');
  const browser = await puppeteer.launch({
    headless: true,
    // executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    timeout: 0,
  });

  //const browser = await puppeteer.connect({
  //  browserWSEndpoint: "ws://127.0.0.1:9222",
  //});
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(TIMEOUT);
  console.log('navigate to auth');
  await page.goto(
    `https://api.sonos.com/login/v3/oauth?client_id=${credentials.client_id}&response_type=code&state=tata&scope=playback-control-all&redirect_uri=https%3A%2F%2Fgoogle.com`
  );
  console.log('skip first screen');
  await page.click("input.button");
  console.log('waiting for navigation');
  console.log(await page.url());
  await page.waitForNavigation();
  console.log('waiting for login page');
  await page.waitForFunction(() => window.location.href == 'https://login.sonos.com/', { timeout: TIMEOUT })
  console.log('fill credentials');
  await page.type("input[name=username]", credentials.login);
  await page.type("input[name=password]", credentials.password);
  console.log('submit login form');
  await page.click("input[type=submit]");
  await page.waitForNavigation();
  console.log('skip consent screen');
  await page.click("button.button");
  await page.waitForNavigation();

  console.log('read auth code');
  const responseurl = new url.URL(page.url());
  const code = responseurl.searchParams.get("code");
  await browser.close();

  const params = new url.URLSearchParams();
  params.append("grant_type", "authorization_code");
  params.append("code", code);
  params.append("redirect_uri", "https://google.com");

  console.log('fetch access token');
  const basicAuth =
    "Basic " +
    Buffer.from(
      `${credentials.client_id}:${credentials.client_secret}`
    ).toString("base64");

  const response = await fetch("https://api.sonos.com/login/v3/oauth/access", {
    method: "POST",
    body: params,
    headers: {
      Authorization: basicAuth,
    },
  });

  const tokens = await response.json();
  return tokens;
}

(async () => {
  console.log("authenticate");
  const tokens = await gettokens();

  console.log("get household");
  const res = await fetch(
    "https://api.ws.sonos.com/control/api/v1/households",
    {
      headers: {
        Authorization: "Bearer " + tokens.access_token,
      },
    }
  );
  const households = await res.json();
  const houseID = households.households[0].id;

  console.log("get players");
  const resplayers = await fetch(
    `https://api.ws.sonos.com/control/api/v1/households/${houseID}/groups`,
    {
      headers: {
        Authorization: "Bearer " + tokens.access_token,
      },
    }
  );
  const players = await resplayers.json();
  console.log("players", players);
  const kitchenplayer = players.players.find((g) => g.name === "Cuisine");
  if (!kitchenplayer) {
    console.log("did not find kitchen player");
    return;
  }

  console.log("create kitchen group");
  const res_creategroup = await fetch(
    `https://api.ws.sonos.com/control/api/v1/households/${houseID}/groups/createGroup`,
    {
      method: "post",
      body: JSON.stringify({ playerIds: [kitchenplayer.id] }),
      headers: {
        Authorization: "Bearer " + tokens.access_token,
        "Content-Type": "application/json",
      },
    }
  );
  const group = await res_creategroup.json();
  console.log("created group", group);
  const kitchengroup = group.group;

  console.log("get favorites");
  const resfavorites = await fetch(
    `https://api.ws.sonos.com/control/api/v1/households/${houseID}/favorites`,
    {
      headers: {
        Authorization: "Bearer " + tokens.access_token,
      },
    }
  );
  const favorites = await resfavorites.json();
  console.log(favorites);
  const france_inter = favorites.items.find((f) => f.id === "12");

  console.log("set france inter in cuisine");
  const loadfav_body = {
    favoriteId: france_inter.id,
  };
  let tryCount = 0;
  let success = false;
  while (tryCount < 5 && !success) {
    console.log(`try counter: ${tryCount}`);
    const setFavResponse = await fetch(
      `https://api.ws.sonos.com/control/api/v1/groups/${kitchengroup.id}/favorites`,
      {
        method: "post",
        body: JSON.stringify(loadfav_body),
        headers: {
          Authorization: "Bearer " + tokens.access_token,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("response status", setFavResponse.status);
    console.log("result", await setFavResponse.json());
    if (setFavResponse.status == 200) {
      success = true;
    } else {
      await new Promise(r => setTimeout(r, 2000));
      tryCount++;
    }
  }
})();
