import {log} from "./logger/logger";

(async () => {

  const fetch = require(`node-fetch`);
  const odiff = require(`odiff`);
  const chalk = require(`chalk`);
  const readline = require(`readline`);

  /*
    const cookies = await readFile(`./db/cookies.json`, (str) => JSON.parse(str));
    const token = cookies.find((item) => item.name === `access_token`);
  */

  const config = {
    trafficType: `voice`,
    volume: `50`,
    cost: `40`,
    limit: `50`
  };
  const getFromApi = async () => (await (await fetch(
    `https://voronezh.tele2.ru/api/exchange/lots?trafficType=${config.trafficType}&volume=${config.volume}&cost=${config.cost}&offset=0&limit=${config.limit}`
  )).json())?.data;

  const unique = (arr) => Array.from(new Set(arr));

  const waitFor = async (time) => {
    await new Promise((resolve) => setTimeout(resolve, time));
  };

  const numberTo2Signs = (number) => {
    if (parseInt(number, 10) < 10) {
      return ` ${number}`;
    } else if (parseInt(number, 10) > 99) {
      return 99;
    } else {
      return number;
    }
  };

  const colorAddSpeed = (speed) => {
    let speedString;
    speed = ` ` + speed + ` `;
    if (speed <= 2) {
      speedString = chalk.bgRgb(139, 195, 74).rgb(51, 51, 51)(speed);
    } else if (speed <= 3) {
      speedString = chalk.rgb(139, 195, 74)(speed);
    } else if (speed <= 5) {
      speedString = chalk.rgb(255, 152, 0)(speed);
    } else if (speed <= 10) {
      speedString = chalk.rgb(244, 67, 54)(speed);
    } else {
      speedString = chalk.bgRgb(244, 67, 54).rgb(51, 51, 51)(speed);
    }

    return speedString;
  };

  const colorBoughtSpeed = (speed) => {
    let speedString;
    speed = ` ` + speed + ` `;
    if (speed <= 0.5) {
      speedString = chalk.rgb(244, 67, 54)(speed);
    } else if (speed <= 1) {
      speedString = chalk.rgb(255, 152, 0)(speed);
    } else if (speed <= 1.5) {
      speedString = chalk.rgb(139, 195, 74)(speed);
    } else if (speed <= 2) {
      speedString = chalk.rgb(139, 195, 74)(speed);
    } else {
      speedString = chalk.bgRgb(139, 195, 74).rgb(51, 51, 51)(speed);
    }

    return speedString;
  };

  log(`-@ Initializing`);
  let db = await getFromApi();
  log(`-@ DB loaded\n`);


  let time = (new Date()).getTime();

  const analytics = {
    spendedTime: 0,
    add: {
      countedLots: 0,
      averageSpeed: 0
    },
    bought: {
      countedLots: 0,
      averageSpeed: 0
    },
  };

  for (let t = 0; ; t = ++t % 10) {
    // await waitFor(500);
    const newDb = await getFromApi();

    const diff = odiff(db, newDb);
    let createdIds = [];
    let removedIds = [];

    for (let change of diff) {
      let changedIds = [];

      if (change.type === `set` && (change.path[1] === `id` || change.path.length === 1)) {
        changedIds = [db[change.path[0]].id];

      } else if (change.type === `add` && change.path.length === 0) {
        changedIds = (change?.val?.id) ? [change?.val?.id] : change?.vals?.map((item) => item?.id);
      } else if (change.type === `rm` && change.path.length === 0) {
        removedIds = [...removedIds, ...change.vals.map((item) => item.id)];
      }
      createdIds = [...createdIds, ...changedIds];
    }

    createdIds = unique(createdIds);
    removedIds = unique(createdIds);

    const boughtIdsCount = removedIds.length - createdIds.length;

    time = (((new Date()).getTime() - time) / 1000);
    const addSpeed = (createdIds.length / time).toPrecision(5);
    const boughtSpeed = (boughtIdsCount / time).toPrecision(5);

    analytics.spendedTime += time;

    analytics.add.countedLots += createdIds.length;
    analytics.add.averageSpeed = (analytics.add.countedLots / analytics.spendedTime).toPrecision(5);

    analytics.bought.countedLots += boughtIdsCount;
    analytics.bought.averageSpeed = (analytics.bought.countedLots / analytics.spendedTime).toPrecision(5);

    log(`    [↑↓ ${time.toFixed(3)}s]`);

    log(
      `${chalk.rgb(0, 0, 0).bgRgb(0, 150, 136)(` + `)} ` +
      `[▣▣ ${numberTo2Signs(createdIds.length)}] ` +
      `[▣≡ ${(addSpeed)}] [≋↓ ${colorAddSpeed(analytics.add.averageSpeed)}]`
    );

    log(
      `${chalk.rgb(0, 0, 0).bgRgb(233, 30, 99)(` - `)} ` +
      `[◪◪ ${(boughtIdsCount >= 0) ? numberTo2Signs(boughtIdsCount) : ` 0`}] ` +
      `[◪≡ ${(boughtSpeed)}] [≋↓ ${colorBoughtSpeed(analytics.bought.averageSpeed)}]`
    );

    log(``);

    db = newDb;
    time = (new Date()).getTime();

    readline.cursorTo(process.stdout, 0);
    readline.moveCursor(process.stdout, null, -4);
  }


})();
