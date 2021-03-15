import Fs from "fs";
import {BaseException, InternetException, LoginException} from "./funcs/exceptions";
import {
  askForCookies,
  askForDB,
  autoRequire,
  getCentrifyingSpaces,
  isLogined,
  linkGetterGenerator,
  rand,
  rand8,
  readCookies,
  readDb,
  readExp,
  repeatIfError,
  waitFor,
  wClick
} from "./funcs/functions";
import {err, log, warn} from "./logger/logger";
import {clearAndRewrite} from "./logger/bot-screen";
import {ProgressBar} from "./logger/progressbar";
import {openNewBrowser} from "./modules/refresh-browser";
import opt from "./config/config.json";

(async () => {
    await autoRequire(`puppeteer`);
    await autoRequire(`string-length`);
    await autoRequire(`puppeteer-extra`);
    await autoRequire(`chalk`);
    await autoRequire(`node-fetch`);
    await autoRequire(`readline`);
    await autoRequire(`puppeteer-extra-plugin-stealth`);

    const chalk = require(`chalk`);
    const fetch = require(`node-fetch`);
    const readline = require(`readline`);

    // Настройки программы

    const printLabel = () => {
      for (let item of opt.label) {
        log(getCentrifyingSpaces(item.length) + item);
      }
    };

    const getLink = linkGetterGenerator(opt.origin);

    let s;
    let rnd;

    let userInfo = {
      balance0: 0
    };

    try {
      printLabel();
      log();

      // Загрузим сохраненную информацию

      const db = await readDb();
      await askForDB(db);

      const cookiesFromFile = await readCookies();
      const restoreCookies = await askForCookies(cookiesFromFile);

      // Запускаем и настраиваем браузер

      const openBrowserAndGetPage = async () => {
        const browser = await openNewBrowser(getLink(), db.headless);
        let page = await browser.newPage();
        return {browser, page};
      };
      const {page} = await openBrowserAndGetPage();

      // Логинимся

      const loginIntoTele2 = async () => {
        if (restoreCookies) {
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
      };
      await loginIntoTele2();

      // Подготовим красивую консоль

      const getBalanceConsoleText = () => `Bought: ${chalk.rgb(0, 0, 0).bgGreen(` ${
        Math.floor((parseInt(userInfo.balance, 10) - parseInt(userInfo.balance0, 10)) / db.price)
      } `)}`;
      const getLotsList = () => `Active: ${userInfo?.active?.list?.map((item) => `[${item.volume.value} ${item.volume.uom}]`).join(` `)}`;
      const getClearingLines = () => [`Clearing.`, getBalanceConsoleText(), getLotsList()];
      const getAddingLines = () => [`Adding.`, getBalanceConsoleText(), getLotsList()];
      const getWaitingLines = () => [`Waiting for ${db.delay} sec.`, getBalanceConsoleText(), getLotsList()];
      const getRepeatingLines = () => [`Repeating.`, getBalanceConsoleText(), getLotsList()];

      const clearAndRewriteFromInfo = (lines, progressBar) => {
        clearAndRewrite(opt.label, userInfo, lines, progressBar);
      };

      // Теле 2 хреново сделали историю лотов, приходится фиксить мне

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
            userInfo.sold = {
              internet: 0,
              calls: 0,
            };
            userInfo.placed = {
              internet: 0,
              calls: 0,
            };
            userInfo.active = {
              calls: 0,
              internet: 0,
              list: []
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
                  userInfo.active.calls += (item.status === `active`) ? 1 : 0;
                } else if (item.trafficType === `data`) {
                  userInfo.placed.internet++;
                  userInfo.sold.internet += (item.status === `bought`) ? 1 : 0;
                  userInfo.active.internet += (item.status === `active`) ? 1 : 0;
                }

                if (item.status === `bought`) {
                  userInfo.dBalance += item.cost.amount;
                }
              }
            }
            // }

            response.data = response.data.filter((item) => {
              if (item.status === `active`) {
                userInfo.active.list.push(item);
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

      // Цикл удаление - заполнение

      const gotoWithPreloader = async (link) => {
        await page.goto(getLink(link), {waitUntil: `load`});
        try {
          await page.waitFor(`.preloader-icon`, {hidden: true, timeout: 30000});
        } catch (e) {
          warn(`"${link}": [Bad connection]. Repeating`);
        }
      };

      let cleared = false;
      const isLotsCleared = async () => {
        if (!page.url().match(/stock-exchange\/my/)) {
          warn(`CLEARING_ERROR: [wrong page]. "cleared" set to false`);
          cleared = false;
          return cleared;
        }
        cleared = false;
        try {
          await page.waitFor(`.my-active-lots > .my-active-lots__list > .my-lot-item:first-child:not(.inactive)`, {timeout: 5000});
        } catch (e) {
          cleared = true;
        }

        return cleared;
      };

      let doWhile = true;
      while (doWhile) {
        try {
          // Перейдем на страницу с лотами, чтобы перехватить запрос и получить инфу о профиле
          await gotoWithPreloader(`/stock-exchange/my`);

          if (!userInfo.balance0 && userInfo.balance) {
            userInfo.balance0 = userInfo.balance;
          }

          await clearAndRewriteFromInfo(getClearingLines());

          cleared = await isLotsCleared();
          if (!cleared) {
            const progressBar = new ProgressBar(4);
            await clearAndRewriteFromInfo(getClearingLines(), progressBar);
          }

          // Удаляем все выложенные лоты

          // todo удалить, если бот снова будет актуален

          console.log(`!! Waiting for ${db.delay} sec !!`);
          await page.waitFor(parseInt(db.delay, 10) * 1000);

          while (!cleared) {
            await repeatIfError(async () => {
              // Открываем страницу с выложенными лотами
              await gotoWithPreloader(`/stock-exchange/my`);

              if (!(await isLotsCleared())) {
                const progressBar = new ProgressBar(5);
                progressBar.incAndRewrite();

                // Открываем окно редактирования лота
                await wClick(page, `.my-active-lots__list > .my-lot-item:first-child .icon-edit`);
                progressBar.incAndRewrite();

                // "Отменить"
                s = `#exchangeEditLotPopup .btns-box .btn:not(.btn-black)`;
                await wClick(page, s);
                progressBar.incAndRewrite();

                // "Вы действительно хотите?"
                s = `#requestExecutorPopup .btns-box .btn:not(.btn-black)`;
                await wClick(page, s);
                progressBar.incAndRewrite();

                let clWarning;
                try {
                  // Окно закрылось
                  s = `#requestExecutorPopup`;
                  await page.waitFor(s, {hidden: true, timeout: 10000});

                } catch (e) {
                  // Окно не закрылось? Да и хрен с ним, продолжаем

                  /*
                    // Попытка повторного закрытия окна
                    s = `#requestExecutorPopup .btns-box .btn:not(.btn-black)`;
                    await wClick(page, s);
                  */
                  clWarning = e.message;
                }

                progressBar.incAndRewrite();
                await clearAndRewriteFromInfo(getClearingLines(), progressBar);
                if (clWarning) {
                  warn(`CLEARING_WARNING: [${clWarning}]. Continuing`);
                }
              }
            }, 3, async (e) => {
              warn(`CLEARING_ERROR: [${e.message}]. Repeating`);
            }, () => {
              warn(`Fatal error`);
              BaseException.handle();
            });
          }

          // Добавляем лоты

          for (let i = 0; i < db.iterations; i++) {
            // Перейдем на страницу с лотами, чтобы перехватить запрос и получить инфу о профиле
            await gotoWithPreloader(`/stock-exchange/my`);

            if (userInfo.active[db.source] >= db.iterations) {
              break;
            }

            try {
              let progressBar = new ProgressBar(7);

              await repeatIfError(async () => {
                // Открываем страницу с соответствующим выкладываемым типами лотов
                await gotoWithPreloader(`/stock-exchange/${db.source}`);

                progressBar = new ProgressBar(7);
                await clearAndRewriteFromInfo(getAddingLines(), progressBar);

                // Открываем окно для выкладываения лота
                await wClick(page, `.exchange-block__create-lot-block .btn-black`);
                progressBar.incAndRewrite();

                // Нажимаем на поле и вводим количество
                await wClick(page, `.lot-setup-popup > .lot-setup__manual-input > a`);

                s = `.lot-setup__field input[pattern="[0-9]*"]`;
                rnd = rand();
                await wClick(page, s);
                await page.click(s, {clickCount: 2});
                await page.type(s, db.amount + ``, {delay: rnd});
                progressBar.incAndRewrite();

                // Нажимаем на поле и вводим цену
                s = `.lot-setup__cost-field-container > .lot-setup__manual-input > a`;
                await wClick(page, s);

                s = `.lot-setup__cost-field-container input[pattern="[0-9]*"]`;
                rnd = rand() + 100;
                await wClick(page, s);
                await page.click(s, {clickCount: 2});
                await page.type(s, db.price + ``, {delay: rnd});
                progressBar.incAndRewrite();
                await clearAndRewriteFromInfo(getAddingLines(), progressBar);
              }, 3, async (e) => {
                // Закончился лимит на лоты
                try {
                  s = `div[data-dialog-type="exchangeNewLotLimitExceededMessage"]`;
                  await page.waitFor(s, {timeout: 5000});
                  warn(`Lot limit per day reached. `);
                  await waitFor(5000);
                  process.exit(0);
                } catch (err2) {
                  // А нет, не закончился
                  warn(`ADDING_1_ERROR: [${err2.message}]. Continuing`);
                }

                // Ошибка, но лот выложен не был, так что при повторении дублирования не будет
                warn(`ADDING_1_ERROR: [${e.message}]. Repeating`);
              }, async () => {
                warn(`Fatal error`);
                BaseException.handle();
              });

              // Добавляем лот нажатием на кнопку
              s = `.btns-box .btn-black`;
              await wClick(page, s);

              progressBar.incAndRewrite();

              try {
                // Зададим смайлики
                s = `#exchangeLotPersonalizationPopup`;
                await page.waitFor(s, {timeout: 10000});

                // Выберем рандомный и кликнем три раза на него
                rnd = rand8();
                s = `.emoji-field__available-values-block img:nth-child(${rnd})`;

                await page.waitFor(s);
                await page.click(s);
                await page.click(s);
                await page.click(s);

                rnd = rand8();

                // Иногда будем делать лот анонимным
                if (rnd === 4) {
                  await wClick(page, `.lot-message-form__name-checkbox label[for="showSellerName"]`);
                }
                progressBar.incAndRewrite();

                // Сохраним текущие настройки
                await wClick(page, `#exchangeLotPersonalizationPopup .btns-box .btn-black`);
                progressBar.incAndRewrite();

                // Подождем, пока окно пропадет
                s = `#exchangeLotPersonalizationPopup`;
                await page.waitFor(`#exchangeLotPersonalizationPopup`, {hidden: true});

                progressBar.incAndRewrite();
                await clearAndRewriteFromInfo(getAddingLines(), progressBar);

              } catch (e) {
                warn(`ADDING_2_ERROR: [${e.message}]. Continuing. This lot this lot wont have emoji`);
              }
            } catch (e) {
              warn(`ADDING_CLICK_ERROR: [${e.message}]. Continuing. This lot may be unplaced`);
            }
          }

          // Подготовимся к ожиданию. Разделим интервал ожидания на некоторое количество промежутков

          // Перейдем на страницу с лотами, чтобы перехватить запрос и получить инфу о профиле
          await gotoWithPreloader(`/stock-exchange/my`);

          const progressBar = new ProgressBar();
          const progressMax = progressBar.progressMaxSymbols;
          const tick = db.delay * 1000 / progressMax;

          await clearAndRewriteFromInfo(getWaitingLines(), progressBar);

          // В течение каждого промежутка будем перерисовывать прогрессбар
          for (let i = 1; i <= progressMax; i++) {
            progressBar.rewriteAndInc();
            await page.waitFor(tick);
          }

          // Магическими строчками что-то очистим
          readline.cursorTo(process.stdout, 0);
          readline.clearLine(process.stdout, 0);

          // Перейдем на страницу с лотами, чтобы перехватить запрос и получить инфу о профиле
          await gotoWithPreloader(`/stock-exchange/my`);

          // Покажем, что бот не завис
          await clearAndRewriteFromInfo(getRepeatingLines());

          /*
              // Неудачная попытка возвращения работоспособности
              await page.close();
              page = await browser.newPage();
          */

          // Сохраним куки, вдруг поменялись
          const cookies = await page.cookies();
          await Fs.writeFile(`./db/cookies.json`, JSON.stringify(cookies, null, 2), (e) => {
            if (e) {
              throw e;
            }
          });

        } catch (e) {
          if (e.message.includes(`Navigation timeout`)) {
            warn(`ITERATION_ERROR: [${e.message}]. Repeating`);
            continue;
          } else {
            throw e;
          }
        }
      }
    } catch (e) {
      if (e instanceof BaseException) {
        err(`[BaseException] ${e.message}`);
      } else {
        err(e.message);
      }
    }
  }
)();
