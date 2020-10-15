import Fs from "fs";
import {LoginException, InternetException, BaseException} from "./funcs/exceptions";
import {
  askForCookies,
  askForDB,
  autoRequire, getCentrifyingSpaces,
  isLogined, linkGetterGenerator, rand, rand8, read,
  readCookies,
  readDb, readExp, repeatIfError,
  wClick
} from "./funcs/functions";
import {err, log, warn} from "./logger/logger";
import {clearAndRewrite} from "./logger/bot-screen";
import {ProgressBar} from "./logger/progressbar";

(async () => {
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
    const readline = require(`readline`);
    puppeteer.use(stealthPlugin());

    // Настройки программы
    const opt = {
      dev: true,
      origin: `https://voronezh.tele2.ru`,
      label: [
        ` _____   ___   _      ___   __ `,
        `|_   _| | __| | |    | __| |_ )`,
        `  | |   | _|  | |__  | _|  /__|`,
        `  |_|   |___| |____| |___|     `
      ]
    };

    const printLabel = () => {
      for (let item of opt.label) {
        log(getCentrifyingSpaces(item.length) + item);
      }
    };

    printLabel();
    log();

    const getLink = linkGetterGenerator(opt.origin);

    let balance0;
    let s;
    let bought;
    let rnd;

    try {
      const db = await readDb();
      await askForDB(db);

      const cookiesFromFile = await readCookies();
      const restoreCookies = await askForCookies(cookiesFromFile);

      const browser = await puppeteer.launch({headless: db.headless, args: [`--start-maximized`]});
      const context = browser.defaultBrowserContext();
      await context.overridePermissions(getLink(), []);
      const page = await browser.newPage();

      await page.setViewport({width: 1400, height: 550});


      if (restoreCookies) {
        // log(`-@ Restoring Cookies`);
        await page.setCookie(...cookiesFromFile);
      }

      await page.goto(getLink(), {waitUntil: `load`}).catch(() => {
        InternetException.handle();
      });

      if (!(await isLogined(page))) {
        await page.goto(getLink(), {waitUntil: `load`}).catch(() => {
          InternetException.handle();
        });

        log(`-@ Logging in`);
        await wClick(page, `div[data-cartridge-type="LoginAction2"]`);

        for (let erCount = 1; erCount <= 3; erCount++) {
          if (await isLogined(page)) {
            const cookies = await page.cookies();
            await Fs.writeFile(`./db/cookies.json`, JSON.stringify(cookies, null, 2), (e) => {
              if (e) {
                throw e;
              }

              log(`-@ Cookies saved successfully`);
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
              log(`-@ Code from SMS`);
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

                log(`-@ Cookies saved successfully`);
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

      await isLogined(page);

      // Теле 2 хреново сделали историю лотов, приходится фиксить мне

      let userInfo = {};
      const getBalanceConsoleText = () => `Bought: ${chalk.rgb(0, 0, 0).bgGreen(` ${
        Math.floor((parseInt(userInfo.balance, 10) - parseInt(balance0, 10)) / db.price)
      } `)}`;
      const getClearingLines = () => [`Clearing.`, getBalanceConsoleText()];
      const getAddingLines = () => [`Adding.`, getBalanceConsoleText()];
      const getWaitingLines = () => [`Waiting for ${db.delay} sec.`, getBalanceConsoleText()];
      const getRepeatingLines = () => [`Repeating.`, getBalanceConsoleText()];

      const clearAndRewriteFromInfo = (lines, progressBar) => {
        clearAndRewrite(opt.label, userInfo, lines, progressBar);
      };

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
            // if (!userInfo?.sold) {

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
            // }

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

          /*
          * Костылим, и пытаемся получить баланс
          * */

          const balanceResponse = await (await fetch(request.url().replace(`exchange/lots/created`, `balance`), {
            method: request.method(),
            credentials: `include`,
            body: request.postData(),
            headers: request.headers()
          })).json();

          if (balanceResponse.data) {
            userInfo.balance = (balanceResponse.data.value) ? balanceResponse.data.value : userInfo.balance;
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
            // if (!userInfo?.rests) {
            const item = response.data;

            /**
             * @param item {object}
             * @param item.tariffCost {object}
             * @param item.tariffCost.amount {string}
             * @param item.tariffPackages {object}
             * @param item.tariffPackages.internet {string}
             * @param item.tariffPackages.min {string}
             * @param restsItem {object}
             * @param restsItem.rollover {boolean}
             * @param restsItem.remain {number}
             * @param restsItem.uom {string}
             * */

            const rollover = {
              internet: 0,
              calls: 0
            };

            for (let restsItem of item.rests) {
              if (restsItem.rollover) {
                switch (restsItem.uom) {
                  case `mb`:
                    rollover.internet += Math.round(restsItem.remain / 1024);
                    break;
                  case `min`:
                    rollover.calls += restsItem.remain;
                    break;
                }
              }
            }

            userInfo.rests = {
              tariffCost: item.tariffCost.amount,
              internet: item.tariffPackages.internet,
              calls: item.tariffPackages.min,
              rollover
            };
            // }
          }

          await request.respond({
            status: 200,
            contentType: `application/json`,
            body: JSON.stringify(response),
          });
        } else if (request.url().endsWith(`balance`) && request.method() === `GET`) {
          const response = await (await fetch(request.url(), {
            method: request.method(),
            credentials: `include`,
            body: request.postData(),
            headers: request.headers()
          })).json();

          if (response.data) {
            userInfo.balance = (response.data.value) ? response.data.value : userInfo.balance;
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


        if (!balance0) {
          balance0 = userInfo.balance;
        }

        bought = Math.floor((parseInt(userInfo.balance, 10) - parseInt(balance0, 10)) / db.price);


        const isLotsCleared = async () => {
          cleared = false;
          try {
            await page.waitFor(`.my-active-lots__list > .my-lot-item:first-child:not(.inactive)`, {timeout: 5000});
          } catch (e) {
            cleared = true;
          }

          return cleared;
        };

        await clearAndRewriteFromInfo(getClearingLines());

        cleared = await isLotsCleared();
        if (!cleared) {
          const progressBar = new ProgressBar(4);
          await clearAndRewriteFromInfo(getClearingLines(), progressBar);
        }

        while (!cleared) {
          await repeatIfError(async () => {
            if (!(await isLotsCleared())) {
              const progressBar = new ProgressBar(4);
              progressBar.incAndRewrite();

              await wClick(page, `.my-active-lots__list > .my-lot-item:first-child .icon-edit`);

              s = `#exchangeEditLotPopup .btns-box .btn:not(.btn-black)`;
              await wClick(page, s);

              progressBar.incAndRewrite();

              s = `#requestExecutorPopup .btns-box .btn:not(.btn-black)`;
              await wClick(page, s);

              progressBar.incAndRewrite();

              try {
                s = `#requestExecutorPopup`;
                await page.waitFor(s, {hidden: true, timeout: 10000});
              } catch (e) {
                s = `#requestExecutorPopup .btns-box .btn:not(.btn-black)`;
                await wClick(page, s);
                s = `#requestExecutorPopup`;
                await page.waitFor(s, {hidden: true, timeout: 10000});
              }
              progressBar.incAndRewrite();
            }
          }, 3, async (e) => {
            warn(`CLEARING_2_ERROR: [${e.message}]. Repeating`);
            await page.goto(getLink(`/stock-exchange/my`), {waitUntil: `load`});
          }, () => {
            warn(`Fatal error`);
            BaseException.handle();
          });
        }

        for (let i = 0; i < db.iterations; i++) {
          try {
            let progressBar = new ProgressBar(3);

            await repeatIfError(async () => {
              progressBar = new ProgressBar(3);
              await clearAndRewriteFromInfo(getAddingLines(), progressBar);

              await page.goto(getLink(`/stock-exchange/${db.source}`), {waitUntil: `load`});
              await wClick(page, `.exchange-block__create-lot-block .btn-black`);

              progressBar.incAndRewrite();

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
              } catch (err2) {
                process.exit(0);
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

            progressBar.incAndRewrite();

            try {
              // Проверим, не закончился ли лимит (100 лотов в день)
              s = `#exchangeLotPersonalizationPopup`;
              await page.waitFor(s, {timeout: 10000});

              rnd = rand8();
              s = `.emoji-field__available-values-block img:nth-child(${rnd})`;

              rnd = rand();
              await wClick(page, s);
              await wClick(page, s, rnd);
              await wClick(page, s, rnd);
              await page.waitFor(rnd);

              rnd = rand8();

              if (rnd === 4) {
                await wClick(page, `.lot-message-form__name-checkbox label[for="showSellerName"]`);
              }

              await wClick(page, `#exchangeLotPersonalizationPopup .btns-box .btn-black`);

              progressBar.incAndRewrite();

              s = `#exchangeLotPersonalizationPopup`;
              await page.waitFor(`#exchangeLotPersonalizationPopup`, {hidden: true});
            } catch (e) {
              warn(`ADDING_2_ERROR: [${e.message}]. Continuing. This lot this lot wont have emoji`);
            }
          } catch (e) {
            warn(`ADDING_CLICK_ERROR: [${e.message}]. Continuing. This lot may be unplaced`);
          }
        }

        const progressBar = new ProgressBar();
        const progressMax = progressBar.progressMaxSymbols;
        const tick = db.delay * 1000 / progressMax;

        await clearAndRewriteFromInfo(getWaitingLines(), progressBar);

        for (let i = 1; i <= progressMax; i++) {
          progressBar.rewriteAndInc();
          await page.waitFor(tick);
        }

        readline.cursorTo(process.stdout, 0);
        readline.clearLine(process.stdout, 0);
        readline.moveCursor(process.stdout, 0, -1);
        readline.clearLine(process.stdout, 0);

        bought = Math.floor((parseInt(userInfo.balance, 10) - parseInt(balance0, 10)) / db.price);

        await clearAndRewriteFromInfo(getRepeatingLines());

        // await page.waitFor(db.delay * 1000);
      }
    } catch (e) {
      if (e instanceof BaseException) {
        err(e.message);
      } else {
        err(e.message);
      }
    }
  }
)();
