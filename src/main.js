import Fs from "fs";
import {LoginException, InternetException, BaseException} from "./exceptions";
import {
  askForCookies,
  askForDB,
  autoRequire, getBalance,
  isLogined, linkGetterGenerator, rand, rand8, read,
  readCookies,
  readDb, readExp, repeatIfError,
  wClick
} from "./functions";
import {log, printTable, warn} from "./logger";

(async () => {

    /*let input = `undergrounder`;
    let grade = 0;
    let half = Math.floor(input.length / 2);
    let delta = (input.length % 2 === 0) ? half : half + 1;
    for (let i = half; i >= 0; i--) {
      let j = i + delta;
      if (input[i] === input[j])
        grade++;
      else
        grade = 0;
    }


    console.log(grade);*/

    await autoRequire(`puppeteer`);
    await autoRequire(`string-length`);
    await autoRequire(`puppeteer-extra`);
    await autoRequire(`chalk`);
    await autoRequire(`node-fetch`);
    await autoRequire(`readline`);
    await autoRequire(`puppeteer-extra-plugin-stealth`);

    const puppeteer = require(`puppeteer-extra`);
    const chalk = require(`chalk`);
    const fetch = require(`node-fetch`);
    const stealthPlugin = require(`puppeteer-extra-plugin-stealth`);
    puppeteer.use(stealthPlugin());

    // Настройки программы

    const opt = {
      dev: true,
      origin: `https://voronezh.tele2.ru`
    };

    const getLink = linkGetterGenerator(opt.origin);

    let balance0;
    let s;
    let b;
    let bought;
    let rnd;


    try {
      log(`--> Tele 2 <--`);

      const db = await readDb();
      await askForDB(db);

      const cookiesFromFile = await readCookies();
      const restoreCookies = await askForCookies(cookiesFromFile);

      // log(`- Starting up`);

      const browser = await puppeteer.launch({headless: !opt.dev, args: [`--start-maximized`]});
      const context = browser.defaultBrowserContext();
      await context.overridePermissions(getLink(), []);
      const page = await browser.newPage();

      await page.setViewport({width: 1400, height: 550});

      if (restoreCookies) {
        // log(`- Restoring Cookies`);
        await page.setCookie(...cookiesFromFile);
      }

      await page.goto(getLink(), {waitUntil: `load`}).catch(() => {
        InternetException.handle();
      });

      if (!(await isLogined(page))) {
        await page.goto(getLink(), {waitUntil: `load`}).catch(() => {
          InternetException.handle();
        });

        log(`- Logging in`);
        await wClick(page, `div[data-cartridge-type="LoginAction2"]`);

        for (let erCount = 1; erCount <= 3; erCount++) {
          if (await isLogined(page)) {
            const cookies = await page.cookies();
            await Fs.writeFile(`./db/cookies.json`, JSON.stringify(cookies, null, 2), (e) => {
              if (e) {
                throw e;
              }

              log(`- Cookies saved successfully`);
            });

            break;
          }

          try {
            s = `form.keycloak-login-form input[type="tel"]`;
            await wClick(page, s);
            await wClick(page, s, 500);
            await page.type(s, db.phone + ``);

            await wClick(page, `form.keycloak-login-form button[type="submit"]`);

            let pin;
            do {
              log(`- Code from SMS`);
              pin = await readExp(/[0-9]{6}/);
              s = `input[pattern="[0-9]*"]`;
              const inputs = await page.$$(s);
              for (let i = 0; i < 6; i++) {
                await inputs[i].type(pin[i]);
                await page.waitFor(100);
              }
            } while (await (async () => {
              try {
                await page.waitFor(`.static-error-text`, {timeout: 5000});
                warn(`Wrong code. Repeating`);
                return true;
              } catch (e) {
                return false;
              }
            })());

            if (await isLogined(page)) {
              const cookies = await page.cookies();
              await Fs.writeFile(`./db/cookies.json`, JSON.stringify(cookies, null, 2), (e) => {
                if (e) {
                  throw e;
                }

                log(`- Cookies saved successfully`);
              });

              break;
            }

            warn(`Unknown trouble. Repeating`);
          } catch (e) {
            warn(`LOGIN: [${e.message}]. Repeating`);
          }

          if (erCount === 3) {
            LoginException.handle();
          }
        }
      }

      s = `.dropdown-menu`;
      await page.waitFor(s);

      // Теле 2 хреново сделали историю лотов, приходится фиксить мне

      let userInfo = {};

      await page.setRequestInterception(true);
      await page.on(`request`, async (request) => {
        if (request.url().endsWith(`created`) && request.method() === `GET`) {
          const response = await (await fetch(request.url(), {
            method: request.method(),
            credentials: `include`,
            body: request.postData(),
            headers: request.headers()
          })).json();

          if (response.data) {
            if (!userInfo?.sold) {

              userInfo.sold = {
                internet: 0,
                calls: 0,
              };
              userInfo.placed = {
                internet: 0,
                calls: 0,
              };
              userInfo.dBalance = 0;


              for (let item of response.data) {

                /**
                 * @param item {object}
                 * @param item.expirationDate {string}
                 * @param item.trafficType {string}
                 * @param item.cost {object}
                 * */

                const expirationDate = new Date(item.expirationDate);
                const nowDate = new Date();
                if (nowDate <= expirationDate) {
                  if (item.trafficType === `voice`) {
                    userInfo.placed.calls++;
                    userInfo.sold.calls += (item.status === `bought`) ? 1 : 0;
                  } else if (item.trafficType === `data`) {
                    userInfo.placed.internet++;
                    userInfo.sold.internet += (item.status === `bought`) ? 1 : 0;
                  }

                  if (item.status === `bought`) {
                    userInfo.dBalance += item.cost.amount;
                  }
                }
              }
            }

            response.data = response.data.filter((item) => {
              if (item.status === `active`) {
                return true;
              }

              const creationDate = new Date(item.creationDate);
              const nowDate = new Date();
              const diff = Math.ceil(Math.abs(nowDate - creationDate) / (1000 * 60 * 60 * 24));

              return (diff <= 1);
            });
          }

          await request.respond({
            status: 200,
            contentType: `application/json`,
            body: JSON.stringify(response),
          });
        } else if (request.url().endsWith(`rests`) && request.method() === `GET`) {
          const response = await (await fetch(request.url(), {
            method: request.method(),
            credentials: `include`,
            body: request.postData(),
            headers: request.headers()
          })).json();

          if (response.data) {
            if (!userInfo?.rests) {
              const item = response.data;

              /**
               * @param item {object}
               * @param item.tariffCost {object}
               * @param item.tariffCost.amount {string}
               * @param item.tariffPackages {object}
               * @param item.tariffPackages.internet {string}
               * @param item.tariffPackages.min {string}
               * */

              userInfo.rests = {
                tariffCost: item.tariffCost.amount,
                internet: item.tariffPackages.internet,
                calls: item.tariffPackages.min
              };
            }
          }

          await request.respond({
            status: 200,
            contentType: `application/json`,
            body: JSON.stringify(response),
          });
        } else {
          await request.continue();
        }
      });


      await page.goto(getLink(`/stock-exchange/my`), {waitUntil: `load`});
      await page.waitFor(`.preloader-icon`, {hidden: true, timeout: 30000});
      // await page.waitFor(900000);

      if (userInfo.sold && userInfo.rests) {
        let pfDelta = userInfo.dBalance - userInfo.rests.tariffCost;
        let pfString = `${((pfDelta >= 0)) ? chalk.green(`+ ` + Math.abs(pfDelta) + ` р.`) : chalk.red(`- ` + Math.abs(pfDelta) + ` р.`)}`;

        printTable(`CURRENT PERIOD DYNAMICS:`, [
          `Calls: ${chalk.green(userInfo.sold.calls)} lot${(userInfo.sold.calls !== 1) ? `s` : ``} / ${userInfo.placed.calls} bought`,
          `Internet: ${chalk.green(userInfo.sold.internet)} lot${(userInfo.sold.internet !== 1) ? `s` : ``} / ${userInfo.placed.internet} bought`,
          `Balance: ${chalk.green(`+ ${userInfo.dBalance} р.`)}`
        ], `ACCOUNT INFO:`, [
          `Calls left: ${userInfo.rests.calls} МИН`,
          `Internet left: ${userInfo.rests.internet}`,
          `Tariff cost: ${userInfo.rests.tariffCost} р.`,
        ], `Profit: ${pfString}`);
      } else {
        printTable([
          `NO INFO`
        ]);
      }

      // Цикл удаление - заполнение

      let doWhile = true;
      while (doWhile) {
        await page.goto(getLink(`/stock-exchange/my`), {waitUntil: `load`});
        try {
          await page.waitFor(`.preloader-icon`, {hidden: true, timeout: 30000});
        } catch (e) {
          warn(`CLEARING_1_ERROR: [Bad connection]. Repeating`);
          continue;
        }
        let cleared = false;

        try {
          await page.waitFor(`.my-lot-item:first-child`, {timeout: 3000});
        } catch (e) {
          cleared = true;
        }

        if (!balance0) {
          balance0 = await getBalance(page);
        }

        b = await getBalance(page);
        bought = Math.floor((parseInt(b, 10) - parseInt(balance0, 10)) / db.price);

        log(`- Clearing.`);
        log(`-* Balance: ${chalk.rgb(0, 0, 0).bgGreen(` ${b} `)}. Bought: ${chalk.rgb(0, 0, 0).bgGreen(` ${bought} `)}`);

        while (!cleared && await page.$(`.my-lot-item:first-child .icon-edit`) !== null) {
          await repeatIfError(async () => {
            await wClick(page, `.my-lot-item:first-child .icon-edit`);

            s = `#exchangeEditLotPopup .btns-box .btn:not(.btn-black)`;
            await wClick(page, s);

            s = `#requestExecutorPopup .btns-box .btn:not(.btn-black)`;
            await wClick(page, s);

            try {
              s = `#requestExecutorPopup`;
              await page.waitFor(s, {hidden: true, timeout: 10000});
            } catch (e) {
              s = `#requestExecutorPopup .btns-box .btn:not(.btn-black)`;
              await wClick(page, s);
              s = `#requestExecutorPopup`;
              await page.waitFor(s, {hidden: true, timeout: 10000});
            }
          }, 3, async (e) => {
            warn(`CLEARING_2_ERROR: [${e.message}]. Repeating`);
            await page.goto(getLink(`/stock-exchange/my`), {waitUntil: `load`});
            await page.waitFor(`.my-lot-item:first-child`);
          }, () => {
            warn(`Fatal error`);
            BaseException.handle();
          });
        }

        log(`- Adding`);
        for (let i = 0; i < db.iterations; i++) {
          try {
            await repeatIfError(async () => {
              await page.goto(getLink(`/stock-exchange/${db.source}`), {waitUntil: `load`});

              await wClick(page, `.exchange-block__create-lot-block .btn-black`);
              await wClick(page, `.lot-setup-popup > .lot-setup__manual-input > a`);

              s = `.lot-setup__field input[pattern="[0-9]*"]`;
              rnd = rand();
              await wClick(page, s);
              await page.click(s, {clickCount: 2});
              await page.type(s, db.amount + ``, {delay: rnd});

              s = `.lot-setup__cost-field-container > .lot-setup__manual-input > a`;
              await wClick(page, s);

              s = `.lot-setup__cost-field-container input[pattern="[0-9]*"]`;
              rnd = rand() + 100;
              await wClick(page, s);
              await page.click(s, {clickCount: 2});
              await page.type(s, db.price + ``, {delay: rnd});
            }, 3, async (e) => {
              try {
                s = `div[data-dialog-type="exchangeNewLotLimitExceededMessage"]`;
                await page.waitFor(s, {timeout: 5000});
                warn(`Lot limit per day reached. Exit?`);
                await read();
                process.exit(0);
              } catch (e) {
                //
              }

              warn(`ADDING_1_ERROR: [${e.message}]. Repeating`);
              await page.goto(getLink(`/stock-exchange/my`), {waitUntil: `load`});
              await page.waitFor(`.my-lot-item:first-child`);
            }, async () => {
              warn(`Fatal error`);
              BaseException.handle();
            });

            s = `.btns-box .btn-black`;
            await wClick(page, s);

            try {
              // Проверим, не закончился ли лимит (100 лотов в день)
              s = `#exchangeLotPersonalizationPopup`;
              await page.waitFor(s);

              rnd = rand8();
              s = `.emoji-field__available-values-block img:nth-child(${rnd})`;

              rnd = rand();
              await wClick(page, s);
              await wClick(page, s, rnd);
              await wClick(page, s, rnd);
              await page.waitFor(rnd);

              rnd = rand8();

              if (rnd > 4) {
                await wClick(page, `.lot-message-form__name-checkbox label[for="showSellerName"]`);
              }
              await wClick(page, `#exchangeLotPersonalizationPopup .btns-box .btn-black`);

              s = `#exchangeLotPersonalizationPopup`;
              await page.waitFor(`#exchangeLotPersonalizationPopup`, {hidden: true});
            } catch (e) {
              warn(`ADDING_2_ERROR: [${e.message}]. Continuing. This lot this lot wont have emoji`);
            }
          } catch (e) {
            warn(`ADDING_CLICK_ERROR: [${e.message}]. Continuing. This lot may be unplaced`);
          }
        }
        try {
          b = await getBalance(page, 10000);
          bought = Math.floor((parseInt(b, 10) - parseInt(balance0, 10)) / db.price);
        } catch (e) {
          b = -1;
          bought = -1;
        }

        log(`- Waiting for ${db.delay} sec.`);
        if (b >= 0 && bought >= 0) {
          log(`-* Balance: ${chalk.rgb(0, 0, 0).bgGreen(` ${b} `)}. Bought: ${chalk.rgb(0, 0, 0).bgGreen(` ${bought} `)}`);
        } else {
          log(`-* Balance: ${chalk.rgb(0, 0, 0).bgGreen(` ${b} `)}. Bought: ${chalk.rgb(0, 0, 0).bgGreen(` ${bought} `)}`);
        }

        await page.waitFor(db.delay * 1000);
      }
    } catch (e) {
      if (e instanceof BaseException) {
        console.error(e.message);
      } else {
        console.error(e.message);
      }
    }
  }
)();
