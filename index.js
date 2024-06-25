const puppeteer = require("puppeteer");
const url = require("url");
const fetch = require("node-fetch");

const credentials = require("./credentials.json");

async function gettokens() {
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: "/usr/bin/chromium-browser",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    timeout: 0,
  });
  // const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(
    `https://api.sonos.com/login/v3/oauth?client_id=${credentials.client_id}&response_type=code&state=tata&scope=playback-control-all&redirect_uri=https%3A%2F%2Fgoogle.com`
  );
  await page.click("input.button");
  await page.waitForNavigation();
  await page.type("input[name=username]", credentials.login);
  await page.type("input[name=password]", credentials.password);
  await page.click("input[type=submit]");
  await page.waitForNavigation();
  await page.click("button.button");
  await page.waitForNavigation();

  const responseurl = new url.URL(page.url());
  const code = responseurl.searchParams.get("code");
  await browser.close();

  const params = new url.URLSearchParams();
  params.append("grant_type", "authorization_code");
  params.append("code", code);
  params.append("redirect_uri", "https://google.com");

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
  console.log("result", await setFavResponse.json());
})();
